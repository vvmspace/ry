require("dotenv").config();

const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const mongoose = require("mongoose");

const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");
const { shouldSkip, setLastTs } = require("../libs/state");

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

async function runJobPageWorker() {
    if (shouldSkip('SAVED_SUCCESS_INTERVAL', 'SAVED_ERROR_INTERVAL', 'saved')) {
        process.exit(0);
    }

    await connectMongo();

    const browser = await puppeteer.launch({
        userDataDir: process.env.USER_DIR || "userdir",
        headless: true, // we can run headless
        defaultViewport: {
            width: 1280,
            height: 720,
        },
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    try {
        // Find a pending job
        const job = await JobPage.findOne({ status: "pending" });
        if (!job) {
            console.log("No pending jobs found. Exiting.");
            return;
        }

        console.log(`Processing job: ${job.url}`);

        const page = (await browser.pages())[0] || (await browser.newPage());
        page.on("console", (msg) => {
            const type = msg.type();
            const text = msg.text();
            if (type === "error") console.error("[browser console][error]", text);
        });

        // Handle new target created (for target="_blank" apply link)
        const newPagePromise = new Promise(resolve => browser.once('targetcreated', resolve));

        await page.goto(job.url, { waitUntil: "networkidle2" });
        const html = await page.content();

        // Parse the data
        const jobData = extractJobDataFromHtml(html);
        console.log("Extracted Data:", jobData);

        // Apply button
        const applyButton = await page.$('form[action*="/apply"] button');
        let applicationUrl = "";

        if (applyButton) {
            console.log("Found apply button, clicking now...");
            await applyButton.click();

            const target = await newPagePromise;
            const appPage = await target.page();

            if (appPage) {
                // Wait for page to navigate / settle
                await appPage.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => { });
                applicationUrl = appPage.url();
                console.log(`Application URL: ${applicationUrl}`);
                await appPage.close();
            } else {
                console.error("Could not get page from target");
            }
        } else {
            console.log("Could not find apply button/form");
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

        await job.save();
        console.log(`Saved job data for ${job.url}`);
        setLastTs('success', 'saved');

    } catch (err) {
        console.error("Error processing job:", err);
        setLastTs('error', 'saved');
    } finally {
        await browser.close();
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    runJobPageWorker().catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });
}

module.exports = {
    extractJobDataFromHtml,
    runJobPageWorker,
};
