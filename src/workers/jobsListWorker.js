require("dotenv").config();

const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const mongoose = require("mongoose");

const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");
const { shouldSkip, setLastTs } = require("../libs/state");

function parseSearchUrls(envValue) {
  const raw = envValue ?? process.env.REMOTEYEAH_SEARCH_URLS;

  if (!raw || typeof raw !== "string") {
    throw new Error("REMOTEYEAH_SEARCH_URLS is not set");
  }

  return raw
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}

function buildAbsoluteUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function extractJobLinksFromHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = new Set();

  $('a[href*="/jobs/"]').each((_, el) => {
    let href = $(el).attr("href");
    if (!href) return;

    href = href.trim();
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) {
      return;
    }

    let absolute = href;
    if (!/^https?:\/\//i.test(href)) {
      absolute = buildAbsoluteUrl(href, baseUrl || "https://remoteyeah.com");
    }

    if (!absolute || !absolute.includes("/jobs/")) return;

    // Filter out URLs with STOP_WORDS
    if (process.env.STOP_WORDS) {
      const stopWords = process.env.STOP_WORDS.split(",").map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
      const urlLower = absolute.toLowerCase();
      const containsStopWord = stopWords.some(word => urlLower.includes(word));
      if (containsStopWord) {
        return;
      }
    }

    links.add(absolute);
  });

  return Array.from(links);
}

async function saveJobLinks(urls) {
  console.log(`Saving ${urls.length} job links to database...`);
  let saved = 0;
  let skipped = 0;
  for (const url of urls) {
    try {
      const result = await JobPage.updateOne(
        { url },
        {
          $setOnInsert: {
            status: "pending",
          },
        },
        { upsert: true }
      );
      if (result.upsertedCount > 0) {
        saved++;
      } else {
        skipped++;
      }
    } catch (err) {
      if (err && err.code === 11000) {
        skipped++;
        continue;
      }
      // log but do not crash the whole worker
      console.error("Failed to save job url", url, err);
    }
  }
  console.log(`Saved ${saved} new jobs, skipped ${skipped} existing jobs`);
  return { saved, skipped };
}

async function parseSearchPage(page, searchUrl) {
  try {
    await page.goto(searchUrl, { waitUntil: "networkidle0", timeout: 30000 });
  } catch (err) {
    if (err.name === "TimeoutError") {
      console.warn(`Timeout loading ${searchUrl}, trying to parse whatever loaded...`);
    } else {
      throw err;
    }
  }

  const html = await page.content();
  const links = extractJobLinksFromHtml(html, searchUrl);
  const { saved, skipped } = await saveJobLinks(links);

  return { found: links.length, saved, skipped };
}

async function runJobsListWorker() {
  if (shouldSkip('PENDING_SUCCESS_INTERVAL', 'PENDING_ERROR_INTERVAL', 'pending')) {
    process.exit(0);
  }

  const searchUrls = parseSearchUrls();
  if (searchUrls.length === 0) {
    console.log("No search urls configured, exiting");
    return;
  }

  await connectMongo();

  const browser = await puppeteer.launch({
    userDataDir: process.env.USER_DIR || "userdir",
    headless: true,
    defaultViewport: {
      width: 1280,
      height: 720,
    },
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = (await browser.pages())[0] || (await browser.newPage());

    let totalFound = 0;
    let totalSaved = 0;

    for (const url of searchUrls) {
      console.log(`Parsing ${url} ...`);
      const { found, saved } = await parseSearchPage(page, url);
      console.log(`${url}: found=${found}, saved=${saved}`);
      totalFound += found;
      totalSaved += saved;
    }

    console.log(`Total found: ${totalFound}, total saved: ${totalSaved}`);
    if (totalSaved === 0) {
      setLastTs('error', 'pending');
    } else {
      setLastTs('success', 'pending');
    }
  } catch (err) {
    setLastTs('error', 'pending');
    throw err;
  } finally {
    await browser.close();
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runJobsListWorker().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  parseSearchUrls,
  extractJobLinksFromHtml,
  saveJobLinks,
  parseSearchPage,
  runJobsListWorker,
};

