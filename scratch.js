require("dotenv").config();
const mongoose = require("mongoose");
const { connectMongo } = require("./src/db/mongoose");
const JobPage = require("./src/models/jobPage");

async function check() {
  await connectMongo();
  const jobs = await JobPage.find({ cvUrl: { $exists: true, $ne: "" } });
  let missingCount = 0;
  for (const job of jobs) {
    console.log(`
      CV: ${job.cvUrl}
      HTML: ${job.cvHtmlUrl}
      PDF: ${job.cvPdfUrl}
    `)
    if (!job.cvHtmlUrl || !job.cvPdfUrl) {
      missingCount++;
    }
  }
  console.log(`Missing count (checked in JS): ${missingCount}`);

  await mongoose.disconnect();
}
check();
