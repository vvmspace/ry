require("dotenv").config();

const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const mongoose = require("mongoose");

const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");

function extractJobDataFromHtml(html) {
    const $ = cheerio.load(html);

    let data = {
        title: "",
        companyName: "",
        salary: "",
        description: "",
    };

    // 1. Try JSON-LD first
    const jsonLdScripts = $('script[type="application/ld+json"]').toArray();
    for (const script of jsonLdScripts) {
        try {
            const content = $(script).html();
            const parsed = JSON.parse(content);
            if (parsed["@type"] === "JobPosting") {
                data.title = parsed.title || data.title;
                data.description = parsed.description || data.description;
                if (parsed.hiringOrganization && parsed.hiringOrganization.name) {
                    data.companyName = parsed.hiringOrganization.name;
                }

                // Extract salary
                if (parsed.baseSalary && parsed.baseSalary.value) {
                    const val = parsed.baseSalary.value;
                    if (val.minValue && val.maxValue) {
                        data.salary = `${val.minValue} - ${val.maxValue} ${parsed.baseSalary.currency || ''} / ${val.unitText || 'YEAR'}`;
                    } else if (val.value) {
                        data.salary = `${val.value} ${parsed.baseSalary.currency || ''} / ${val.unitText || 'YEAR'}`;
                    }
                }
            }
        } catch (e) {
            // ignore JSON parse errors
        }
    }

    // Fallback to DOM parsing if missing
    if (!data.title) {
        data.title = $('h1').first().text().trim();
    }

    if (!data.companyName) {
        // Look for company link/text near title
        data.companyName = $('h1').parent().find('a[href*="/company/"]').first().text().trim();
    }

    return data;
}

async function runJobPageWorker() {
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

    } catch (err) {
        console.error("Error processing job:", err);
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
