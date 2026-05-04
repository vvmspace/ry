'use strict';

require("dotenv").config();
const mongoose = require("mongoose");
const fs = require('fs');
const path = require('path');
const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");
const ai = require("../libs/abstract-ai");

async function claimNextJobForLegend() {
  const job = await JobPage.findOneAndUpdate(
    {
      status: { $in: ['screening', 'interview'] },
      $or: [
        { legend: null },
        { legend: "" },
        { legend: { $exists: false } }
      ],
      $or: [
        { legendStartedAt: { $exists: false } },
        { legendStartedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } } // 10 min timeout
      ]
    },
    { $set: { legendStartedAt: new Date() } },
    { returnDocument: 'after', sort: { legend: -1, createdAt: -1 } }
  );

  return { job, noMoreJobs: !job && !(await JobPage.exists({
    status: { $in: ['screening', 'interview'] },
    $or: [{ legend: null }, { legend: "" }, { legend: { $exists: false } }]
  })) };
}

async function generateLegend(jobId) {
  const job = await JobPage.findById(jobId);
  if (!job) throw new Error("Job not found");

  let cvText = '';
  const cvPath = path.resolve(process.cwd(), 'full_cv.md');
  const cvExamplePath = path.resolve(process.cwd(), 'full_cv.example.md');

  if (fs.existsSync(cvPath)) {
    cvText = fs.readFileSync(cvPath, 'utf8');
  } else if (fs.existsSync(cvExamplePath)) {
    cvText = fs.readFileSync(cvExamplePath, 'utf8');
  } else {
    throw new Error("No CV file found (full_cv.md or full_cv.example.md)");
  }

  const promptPath = path.resolve(process.cwd(), 'prompts/legend.md');
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }
  const promptTemplate = fs.readFileSync(promptPath, 'utf8');

  const vacancyText = `Title: ${job.title}\nCompany: ${job.companyName}\nSalary: ${job.salary || 'N/A'}\n\nDescription:\n${job.description || ''}`;

  let cvSentText = '';
  const jsonUrl = job.cvJsonUrl || job.jsonUrl;
  if (jsonUrl) {
    try {
      const res = await fetch(jsonUrl);
      if (res.ok) {
        const data = await res.json();
        cvSentText = JSON.stringify(data, null, 2);
      }
    } catch (err) {
      console.warn(`Failed to fetch JSON CV from ${jsonUrl}:`, err.message);
    }
  } else if (job.cvHtmlUrl) {
    try {
      const res = await fetch(job.cvHtmlUrl);
      if (res.ok) {
        const html = await res.text();
        const cheerio = require('cheerio');
        const $ = cheerio.load(html);
        cvSentText = $('body').text().replace(/\s+/g, ' ').trim();
      }
    } catch (err) {
      console.warn(`Failed to fetch HTML CV from ${job.cvHtmlUrl}:`, err.message);
    }
  }

  const result = await ai.ask(promptTemplate, 'local,gemma,gemini-2.5-flash', {
    description: vacancyText,
    cv: cvText,
    cv_sent: cvSentText,
    cover_letter: job.coverLetter || '',
    why_answer: job.whyAnswer || ''
  });

  if (result) {
    job.legend = result;
    job.legendStartedAt = undefined;
    job.updatedAt = new Date();
    await job.save();
    return job;
  } else {
    throw new Error("AI returned empty result");
  }
}

async function runLegendWorker() {
  console.log('\x1b[36m\x1b[1m📜  LEGEND WORKER\x1b[0m');

  await connectMongo();

  try {
    while (true) {
      let job;
      try {
        const result = await claimNextJobForLegend();
        if (result.noMoreJobs) {
          console.log(`No more jobs found for legend generation.`);
          break;
        }
        if (!result.job) {
          continue;
        }
        job = result.job;
      } catch (err) {
        console.error(`Failed to fetch/claim job from DB:`, err);
        break;
      }

      console.log(`Generating legend for job: ${job.title} (${job.companyName})`);

      try {
        await generateLegend(job._id);
        console.log(`✅ Successfully generated legend for ${job.url}`);
      } catch (err) {
        console.error(`Legend generation failed for ${job.url}:`, err);
        job.legendStartedAt = undefined; // Clear lock to allow retry
        await job.save();
      }
    }
  } catch (err) {
    console.error("Legend Worker fatal error:", err);
    process.exitCode = 1;
  } finally {
    if (require.main === module) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  const t0 = require('perf_hooks').performance.now();
  console.log(`Job started at: ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date())}`);
  runLegendWorker().catch(err => {
    console.error(err);
    process.exit(1);
  }).finally(() => {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date());
    console.log(`Job completed at: ${time} (Duration: ${((require('perf_hooks').performance.now() - t0) / 1000).toFixed(2)}s)`);
  });
}

module.exports = { runLegendWorker, generateLegend };
