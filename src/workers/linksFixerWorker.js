require("dotenv").config();

const puppeteer = require("puppeteer");
const mongoose = require("mongoose");

const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");
const { shouldSkip, setLastTs } = require("../libs/state");

const DEFAULT_INTERVAL_SECONDS = 0;
const SKIP_STATE_KEY = "fixed";
const LOGIN_HOST = "remoteyeah.com/login";

function ensureIntervalDefaults() {
  if (!process.env.LINKS_FIXER_SUCCESS_INTERVAL) {
    process.env.LINKS_FIXER_SUCCESS_INTERVAL = String(DEFAULT_INTERVAL_SECONDS);
  }
  if (!process.env.LINKS_FIXER_ERROR_INTERVAL) {
    process.env.LINKS_FIXER_ERROR_INTERVAL = String(DEFAULT_INTERVAL_SECONDS);
  }
}

async function runLinksFixerWorker() {
  console.log("\x1b[33m\x1b[1m🔗  LINKS FIXER WORKER\x1b[0m");
  ensureIntervalDefaults();

  if (shouldSkip("LINKS_FIXER_SUCCESS_INTERVAL", "LINKS_FIXER_ERROR_INTERVAL", SKIP_STATE_KEY)) {
    process.exit(0);
  }

  await connectMongo();

  let browser;

  try {
    const job = await JobPage.findOne({
      applicationUrl: { $regex: LOGIN_HOST, $options: "i" },
      status: { $nin: ["applied", "expired", "error"] },
    })
      .sort({ matchRate: -1, createdAt: -1 });

    if (!job) {
      console.log("No job with a login redirect application URL found. Exiting.");
      setLastTs("error", SKIP_STATE_KEY);
      return;
    }

    console.log(`Fixing application link for job ${job.url}`);

    browser = await puppeteer.launch({
      userDataDir: process.env.USER_DIR || "userdir",
      headless: true,
      defaultViewport: { width: 1280, height: 720 },
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = (await browser.pages())[0] || (await browser.newPage());
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error("[browser console][error]", msg.text());
      }
    });

    await page.goto(job.url, { waitUntil: "networkidle2" });

    const applyButton = await page.$("form[action*='/apply'] button");
    let applicationUrl = job.applicationUrl;

    if (applyButton) {
      const newPagePromise = new Promise((resolve) => browser.once("targetcreated", resolve));
      console.log("Clicking apply to refresh the application URL...");
      await applyButton.click();

      const target = await newPagePromise;
      if (target) {
        const appPage = await target.page();
        if (appPage) {
          await appPage.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
          applicationUrl = appPage.url();
          console.log(`Captured redirected application URL: ${applicationUrl}`);
          await appPage.close();
        } else {
          console.error("Apply target did not expose a page instance.");
        }
      } else {
        console.error("Clicking apply did not spawn a new target.");
      }
    } else {
      console.warn("Apply button not found on the job page.");
    }

    const shouldFallbackToJobUrl = !applicationUrl || applicationUrl.toLowerCase().includes(LOGIN_HOST);
    const finalUrl = shouldFallbackToJobUrl ? job.url : applicationUrl;

    if (finalUrl) {
      job.applicationUrl = finalUrl;
      try {
        const parsed = new URL(finalUrl);
        job.domain = parsed.hostname;
      } catch (err) {
        console.error("Failed to parse domain from application URL", err);
      }
    }

    await job.save();
    console.log(`Updated application URL for job ${job.url}`);
    setLastTs("success", SKIP_STATE_KEY);
  } catch (err) {
    console.error("Links fixer worker error:", err);
    setLastTs("error", SKIP_STATE_KEY);
  } finally {
    if (browser) {
      await browser.close();
    }
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  const t0 = require('perf_hooks').performance.now();
  console.log(`Job started at: ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date())}`);
  runLinksFixerWorker().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  }).finally(() => {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date());
    console.log(`Job completed at: ${time} (Duration: ${((require('perf_hooks').performance.now() - t0) / 1000).toFixed(2)}s)`);
  });
}

module.exports = {
  runLinksFixerWorker,
};
