require("dotenv").config();

const mongoose = require("mongoose");

const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");

const EXCLUDED_STATUSES = ["expired", "applied", "error"];

function isExpirationSignal(httpStatus, bodyText) {
  if (httpStatus === 404) {
    return true;
  }

  if (typeof bodyText !== "string") {
    return false;
  }

  return /\bnot\s+found\b/i.test(bodyText) || /\bno\s+longer\s+available\b/i.test(bodyText);
}

function isNotFoundRedirect(urlValue) {
  if (!urlValue || typeof urlValue !== "string") {
    return false;
  }

  try {
    const url = new URL(urlValue);
    const value = url.searchParams.get("not_found");
    return typeof value === "string" && value.toLowerCase() === "true";
  } catch {
    return false;
  }
}

function getCheckUrl(job) {
  return (job?.applicationUrl || job?.url || "").trim();
}

async function checkUrlForExpiration(url) {
  const response = await fetch(url, {
    redirect: "follow",
  });

  const body = await response.text().catch(() => "");
  return {
    isExpired: isExpirationSignal(response.status, body) || isNotFoundRedirect(response.url),
    statusCode: response.status,
    finalUrl: response.url,
  };
}

async function runExpirationWorker() {
  console.log("\x1b[34m\x1b[1m⏳  EXPIRATION WORKER\x1b[0m");
  await connectMongo();

  try {
    const job = await JobPage.findOne({
      status: { $nin: EXCLUDED_STATUSES },
    }).sort({ updatedAt: 1 });

    if (!job) {
      console.log("No eligible jobs found. Exiting.");
      return;
    }

    const checkUrl = getCheckUrl(job);
    if (!checkUrl) {
      console.log(`Job ${job._id} has no URL to check, touching updatedAt only.`);
      job.updatedAt = new Date();
      await job.save();
      return;
    }

    console.log(`Checking job ${job._id} -> ${checkUrl}`);
    const { isExpired, statusCode, finalUrl } = await checkUrlForExpiration(checkUrl);

    if (isExpired) {
      job.status = "expired";
      console.log(`Marked as expired (HTTP ${statusCode}, final URL: ${finalUrl})`);
    } else {
      console.log(`Still active (HTTP ${statusCode}, final URL: ${finalUrl})`);
    }

    job.updatedAt = new Date();
    await job.save();
  } catch (err) {
    console.error("Expiration worker error:", err);
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runExpirationWorker().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  EXCLUDED_STATUSES,
  isExpirationSignal,
  isNotFoundRedirect,
  getCheckUrl,
  checkUrlForExpiration,
  runExpirationWorker,
};
