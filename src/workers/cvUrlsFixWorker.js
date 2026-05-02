require("dotenv").config();
const mongoose = require("mongoose");
const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");

async function runCvUrlsFixWorker() {
  console.log('\x1b[35m\x1b[1m🤖  CV URLS FIX WORKER\x1b[0m');
  
  await connectMongo();

  try {
    // Mongoose query matching: !!cvUrl && (!cvHtmlUrl || !cvPdfUrl)
    const jobs = await JobPage.find({
      cvUrl: { $exists: true, $ne: "" },
      $or: [
        { cvHtmlUrl: { $exists: false } },
        { cvHtmlUrl: null },
        { cvHtmlUrl: "" },
        { cvPdfUrl: { $exists: false } },
        { cvPdfUrl: null },
        { cvPdfUrl: "" }
      ]
    })
    .sort({ createdAt: 1 })
    .limit(1000);

    console.log(`Found ${jobs.length} jobs to process.`);

    let updatedCount = 0;

    for (const job of jobs) {
      let updated = false;

      // If cvPdfUrl is not set and cvUrl is not empty - set cvPdfUrl = cvUrl
      if (!job.cvPdfUrl && job.cvUrl) {
        job.cvPdfUrl = job.cvUrl;
        updated = true;
      }

      // If cvHtmlUrl is empty then replace .pdf with .html from cvPdfUrl or cvUrl
      if (!job.cvHtmlUrl) {
        const sourceUrl = job.cvPdfUrl || job.cvUrl;
        if (sourceUrl && sourceUrl.includes('.pdf')) {
          job.cvHtmlUrl = sourceUrl.replace(/\.pdf(\?|$)/, '.html$1');
          updated = true;
        }
      }

      if (updated) {
        await job.save();
        updatedCount++;
      }
    }

    console.log(`Updated ${updatedCount} jobs.`);
  } catch (err) {
    console.error("CV URLs fix worker failed:", err);
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCvUrlsFixWorker().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  runCvUrlsFixWorker,
};
