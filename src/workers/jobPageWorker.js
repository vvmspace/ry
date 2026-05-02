require("dotenv").config();

const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const mongoose = require("mongoose");

const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");
const { shouldSkip, setLastTs, allocateBrowser, releaseBrowser } = require("../libs/state");
const { checkUrlForExpiration, getCheckUrl } = require("./expirationWorker");

const DEFAULT_APPLY_TIMEOUT_MS = 15000;
const APPLY_REDIRECT_TIMEOUT_MS = 3000;
const JOB_PAGE_READY_TIMEOUT_MS = 10000;

const TIMER = {
    WORKER: "[jobs:parse] worker total",
    DB_CONNECT: "[jobs:parse] db connect",
    BROWSER_LAUNCH: "[jobs:parse] browser launch",
    FIND_PENDING: "[jobs:parse] find pending job",
    PAGE_GOTO: "[jobs:parse] page goto",
    PAGE_CONTENT: "[jobs:parse] page content",
    DATA_PARSE: "[jobs:parse] parse html",
    APPLY_FLOW: "[jobs:parse] apply flow",
    DB_SAVE: "[jobs:parse] save job",
    BROWSER_CLOSE: "[jobs:parse] browser close",
    DB_DISCONNECT: "[jobs:parse] db disconnect",
};

function isMeaningfulUrl(url) {
    return Boolean(url && url !== "about:blank");
}

async function waitForJobPageReady(page) {
    await page
        .waitForFunction(
            () =>
                Boolean(
                    document.querySelector("h1") ||
                    document.querySelector('form[action*="/apply"] button') ||
                    document.querySelector('script[type="application/ld+json"]')
                ),
            { timeout: JOB_PAGE_READY_TIMEOUT_MS }
        )
        .catch(() => { });
}

function resolveApplyTimeoutMs() {
    const raw = process.env.JOB_PARSE_APPLY_TIMEOUT_MS;
    if (!raw) return DEFAULT_APPLY_TIMEOUT_MS;

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        console.warn(
            `[apply-flow] Invalid JOB_PARSE_APPLY_TIMEOUT_MS="${raw}", fallback=${DEFAULT_APPLY_TIMEOUT_MS}ms`
        );
        return DEFAULT_APPLY_TIMEOUT_MS;
    }

    return parsed;
}

function resolveParseCountFromArgv() {
    const defaultCount = 1;
    const arg = process.argv.find((item) => typeof item === "string" && item.startsWith("--count="));
    if (!arg) return defaultCount;

    const raw = arg.slice("--count=".length);
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        console.warn(`[jobs:parse] Invalid --count="${raw}", fallback=${defaultCount}`);
        return defaultCount;
    }

    return parsed;
}

function withTimeout(promise, timeoutMs, label) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`[apply-flow][timeout] ${label} exceeded ${timeoutMs}ms`)), timeoutMs);
        }),
    ]).finally(() => clearTimeout(timer));
}

function extractJobDataFromHtml(html) {
    const $ = cheerio.load(html);

    let data = {
        title: "",
        companyName: "",
        salary: "",
        description: "",
        // optional
        sourceJobTitle: "",
        sourceJobType: "",
        sourceExperienceLevel: "",
        degreeRequired: undefined,
        skills: [],
        locations: [],
        benefits: [],
    };

    // 1. Try JSON-LD first
    const jsonLdScripts = $('script[type="application/ld+json"]').toArray();
    for (const script of jsonLdScripts) {
        try {
            const content = $(script).html();
            const parsed = JSON.parse(content);
            if (parsed["@type"] !== "JobPosting") continue;

            data.title = parsed.title || data.title;
            data.description = parsed.description || data.description;

            if (parsed.hiringOrganization?.name) {
                data.companyName = parsed.hiringOrganization.name;
            }

            // Salary
            if (parsed.baseSalary?.value) {
                const val = parsed.baseSalary.value;
                const cur = parsed.baseSalary.currency || "";
                const unit = val.unitText || "YEAR";
                if (val.minValue && val.maxValue) {
                    data.salary = `${cur} ${val.minValue}—${cur} ${val.maxValue} / ${unit}`.trim();
                } else if (val.value) {
                    data.salary = `${cur} ${val.value} / ${unit}`.trim();
                }
            }

            // Job type (employmentType: ["FULL_TIME"] -> "Full-time")
            if (parsed.employmentType) {
                const types = Array.isArray(parsed.employmentType) ? parsed.employmentType : [parsed.employmentType];
                const typeMap = { FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACTOR: "Contract", TEMPORARY: "Temporary", INTERN: "Internship" };
                data.sourceJobType = types.map(t => typeMap[t] || t).join(", ");
            }

            // Experience level (monthsOfExperience -> rough mapping)
            if (parsed.experienceRequirements?.monthsOfExperience) {
                const months = parsed.experienceRequirements.monthsOfExperience;
                if (months <= 12) data.sourceExperienceLevel = "Entry";
                else if (months <= 36) data.sourceExperienceLevel = "Mid";
                else data.sourceExperienceLevel = "Senior";
            }

            // Skills
            if (parsed.skills) {
                data.skills = parsed.skills.split(",").map(s => s.trim()).filter(Boolean);
            }

            // Locations
            if (parsed.applicantLocationRequirements) {
                const locs = Array.isArray(parsed.applicantLocationRequirements)
                    ? parsed.applicantLocationRequirements
                    : [parsed.applicantLocationRequirements];
                data.locations = locs.map(l => l.name).filter(Boolean);
            }

            // Benefits
            if (parsed.jobBenefits) {
                data.benefits = parsed.jobBenefits.split(",").map(s => s.trim()).filter(Boolean);
            }

            // Degree required
            if (typeof parsed.educationRequirements !== "undefined") {
                data.degreeRequired = true;
            }

            break;
        } catch (e) {
            // ignore JSON parse errors
        }
    }

    // 2. DOM fallbacks for required fields
    if (!data.title) {
        // strip "Remote " prefix if present
        const h1 = $('h1').first().text().trim();
        data.title = h1.replace(/^Remote\s+/i, "").trim();
    }

    if (!data.companyName) {
        data.companyName = $('a[href*="/remote-companies/"]').first().text().trim()
            || $('h1').parent().find('a[href*="/company/"]').first().text().trim();
    }

    if (!data.salary) {
        data.salary = $(".tag--salary").first().text().trim();
    }

    // 3. DOM fallbacks for optional fields
    if (!data.sourceJobTitle) {
        // "Job title" section tags
        const jobTitleSection = $('h2').filter((_, el) => $(el).text().trim() === "Job title").first();
        data.sourceJobTitle = jobTitleSection.closest(".flex").find(".tag").first().text().trim();
    }

    if (!data.sourceJobType) {
        const jobTypeSection = $('h2').filter((_, el) => $(el).text().trim() === "Job type").first();
        data.sourceJobType = jobTypeSection.closest(".flex").find(".tag").first().text().trim();
    }

    if (!data.sourceExperienceLevel) {
        const expSection = $('h2').filter((_, el) => $(el).text().trim() === "Experience level").first();
        data.sourceExperienceLevel = expSection.closest(".flex").find(".tag").first().text().trim();
    }

    if (typeof data.degreeRequired === "undefined") {
        const degreeText = $('a[href*="no-degree"]').text().toLowerCase();
        if (degreeText.includes("no degree")) data.degreeRequired = false;
    }

    if (!data.skills.length) {
        const skillsSection = $('h2').filter((_, el) => $(el).text().trim() === "Skills").first();
        data.skills = skillsSection.closest(".flex").find(".tag").map((_, el) => $(el).text().trim()).get().filter(Boolean);
    }

    if (!data.locations.length) {
        const locSection = $('h2').filter((_, el) => /location/i.test($(el).text())).first();
        data.locations = locSection.closest(".flex").find(".tag").map((_, el) => $(el).text().trim()).get().filter(Boolean);
    }

    if (!data.benefits.length) {
        const benSection = $('h2').filter((_, el) => /benefit/i.test($(el).text())).first();
        data.benefits = benSection.closest(".flex").find(".tag").map((_, el) => $(el).text().trim()).get().filter(Boolean);
    }

    return data;
}

async function resolveApplicationUrlFromApply({ page, browser, timeoutMs }) {
    const startMs = Date.now();
    console.log(`[apply-flow] start | timeout=${timeoutMs}ms`);

    const initialPageUrl = page.url();
    const applyButton = await page.$('form[action*="/apply"] button');
    if (!applyButton) {
        console.warn("[apply-flow] apply button not found");
        return "";
    }

    console.log("[apply-flow] apply button found; clicking...");

    let applicationUrl = "";
    const sourceTarget = page.target();
    const targetCreatedPromise = browser.waitForTarget(
        (target) => target.type() === "page" && target !== sourceTarget && target.opener() === sourceTarget,
        { timeout: timeoutMs }
    );

    await applyButton.click();
    console.log("[apply-flow] click sent");

    let target = null;
    try {
        target = await withTimeout(targetCreatedPromise, timeoutMs, "waiting for apply target");
        console.log(`[apply-flow] target created in ${Date.now() - startMs}ms`);
    } catch (err) {
        console.warn(`[apply-flow] target not created: ${err.message}`);
    }

    if (target) {
        const appPage = await target.page();
        if (!appPage) {
            console.warn("[apply-flow] target has no page instance");
        } else {
            try {
                applicationUrl = appPage.url();
                if (!isMeaningfulUrl(applicationUrl)) {
                    await Promise.race([
                        appPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: APPLY_REDIRECT_TIMEOUT_MS }).catch(() => { }),
                        appPage.waitForFunction(
                            () => window.location.href && window.location.href !== "about:blank",
                            { timeout: APPLY_REDIRECT_TIMEOUT_MS }
                        ).catch(() => { }),
                    ]);
                    applicationUrl = appPage.url();
                }

                if (isMeaningfulUrl(applicationUrl)) {
                    console.log(`[apply-flow] captured from new tab: ${applicationUrl}`);
                }
            } finally {
                await appPage.close().catch(() => { });
            }
        }
    }

    if (!applicationUrl) {
        const currentUrl = page.url();
        if (currentUrl && currentUrl !== initialPageUrl) {
            applicationUrl = currentUrl;
            console.log(`[apply-flow] fallback to current page url: ${applicationUrl}`);
        } else {
            console.warn(
                `[apply-flow] no application URL detected; initial=${initialPageUrl} current=${currentUrl}`
            );
        }
    }

    console.log(`[apply-flow] done in ${Date.now() - startMs}ms`);
    return applicationUrl;
}

async function runJobPageWorker() {
    console.log('\x1b[33m\x1b[1m📄  JOB PAGE WORKER\x1b[0m');
    console.time(TIMER.WORKER);
    if (shouldSkip('SAVED_SUCCESS_INTERVAL', 'SAVED_ERROR_INTERVAL', 'saved')) {
        console.timeEnd(TIMER.WORKER);
        process.exit(0);
    }

    console.time(TIMER.DB_CONNECT);
    await connectMongo();
    console.timeEnd(TIMER.DB_CONNECT);

    console.time(TIMER.BROWSER_LAUNCH);
    if (!allocateBrowser()) {
        console.log("Browser in use, skipping...");
        console.timeEnd(TIMER.BROWSER_LAUNCH);
        console.timeEnd(TIMER.WORKER);
        await mongoose.disconnect();
        return;
    }

    const browser = await puppeteer.launch({
        userDataDir: process.env.USER_DIR || "userdir",
        headless: true, // we can run headless
        defaultViewport: {
            width: 1280,
            height: 720,
        },
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    console.timeEnd(TIMER.BROWSER_LAUNCH);

    try {
        const parseCount = resolveParseCountFromArgv();
        console.log(`[jobs:parse] count=${parseCount}`);

        const page = (await browser.pages())[0] || (await browser.newPage());
        page.on("console", (msg) => {
            const type = msg.type();
            const text = msg.text();
            if (type === "error") console.error("[browser console][error]", text);
        });

        let processed = 0;
        const applyTimeoutMs = resolveApplyTimeoutMs();
        console.log(`[apply-flow] configured timeout=${applyTimeoutMs}ms`);

        for (let i = 0; i < parseCount; i++) {
            // Find a pending job
            console.time(TIMER.FIND_PENDING);
            const job = await JobPage.findOne({ status: "pending" });
            console.timeEnd(TIMER.FIND_PENDING);
            if (!job) {
                console.log("No pending jobs found. Exiting.");
                break;
            }

            console.log(`Processing job: ${job.url}`);

            const expirationCheckUrl = getCheckUrl(job);
            if (expirationCheckUrl) {
                const { isExpired, statusCode, finalUrl, fetchError } = await checkUrlForExpiration(expirationCheckUrl);
                if (fetchError) {
                    console.log(`[jobs:parse] expiration pre-check skipped (${fetchError}, URL: ${finalUrl || expirationCheckUrl})`);
                } else if (isExpired) {
                    job.status = "expired";
                    console.time(TIMER.DB_SAVE);
                    await job.save();
                    console.timeEnd(TIMER.DB_SAVE);
                    console.log(`[jobs:parse] marked as expired before parse (HTTP ${statusCode}, final URL: ${finalUrl})`);
                    processed++;
                    continue;
                }
            }

            console.time(TIMER.PAGE_GOTO);
            await page.goto(job.url, { waitUntil: "domcontentloaded" });
            await waitForJobPageReady(page);
            console.timeEnd(TIMER.PAGE_GOTO);

            console.time(TIMER.PAGE_CONTENT);
            const html = await page.content();
            console.timeEnd(TIMER.PAGE_CONTENT);

            // Parse the data
            console.time(TIMER.DATA_PARSE);
            const jobData = extractJobDataFromHtml(html);
            console.timeEnd(TIMER.DATA_PARSE);
            console.log("Extracted Data:", jobData);

            // Apply button
            let applicationUrl = "";
            console.time(TIMER.APPLY_FLOW);
            applicationUrl = await resolveApplicationUrlFromApply({
                page,
                browser,
                timeoutMs: applyTimeoutMs,
            });
            console.timeEnd(TIMER.APPLY_FLOW);
            if (applicationUrl) {
                console.log(`Application URL: ${applicationUrl}`);
            }

            // Save job
            job.title = jobData.title;
            job.companyName = jobData.companyName;
            job.salary = jobData.salary;
            job.description = jobData.description;
            job.applicationUrl = applicationUrl;

            // Optional fields
            if (jobData.sourceJobTitle) job.sourceJobTitle = jobData.sourceJobTitle;
            if (jobData.sourceJobType) job.sourceJobType = jobData.sourceJobType;
            if (jobData.sourceExperienceLevel) job.sourceExperienceLevel = jobData.sourceExperienceLevel;
            if (typeof jobData.degreeRequired === "boolean") job.degreeRequired = jobData.degreeRequired;
            if (jobData.skills?.length) job.skills = jobData.skills;
            if (jobData.locations?.length) job.locations = jobData.locations;
            if (jobData.benefits?.length) job.benefits = jobData.benefits;

            if (applicationUrl) {
                try {
                    const urlObj = new URL(applicationUrl);
                    job.domain = urlObj.hostname;
                } catch (e) {
                    console.error("Failed to parse domain from url:", applicationUrl);
                }
            }

            job.status = "saved";

            console.time(TIMER.DB_SAVE);
            await job.save();
            console.timeEnd(TIMER.DB_SAVE);
            console.log(`Saved job data for ${job.url}`);
            processed++;
        }

        if (processed > 0) {
            setLastTs('success', 'saved');
        } else {
            setLastTs('error', 'saved');
        }

    } catch (err) {
        console.error("Error processing job:", err);
        setLastTs('error', 'saved');
    } finally {
        console.time(TIMER.BROWSER_CLOSE);
        if (browser) {
            await browser.close().catch(() => {});
            releaseBrowser();
        }
        console.timeEnd(TIMER.BROWSER_CLOSE);

        console.time(TIMER.DB_DISCONNECT);
        await mongoose.disconnect();
        console.timeEnd(TIMER.DB_DISCONNECT);
        console.timeEnd(TIMER.WORKER);
    }
}

if (require.main === module) {
  const t0 = require('perf_hooks').performance.now();
  console.log(`Job started at: ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date())}`);
    runJobPageWorker().catch((err) => {
        console.error(err);
        process.exitCode = 1;
    }).finally(() => {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date());
    console.log(`Job completed at: ${time} (Duration: ${((require('perf_hooks').performance.now() - t0) / 1000).toFixed(2)}s)`);
  });
}

module.exports = {
    extractJobDataFromHtml,
    resolveApplyTimeoutMs,
    resolveParseCountFromArgv,
    resolveApplicationUrlFromApply,
    runJobPageWorker,
};
