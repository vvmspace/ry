'use strict';

require("dotenv").config();
const mongoose = require("mongoose");
const fs = require('fs');
const path = require('path');
const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");
const ai = require("../libs/abstract-ai");

async function claimNextJobForBestCandidate() {
  const job = await JobPage.findOneAndUpdate(
    {
      status: { $in: ['screening', 'interview'] },
      $or: [
        { bestCandidate: null },
        { bestCandidate: "" },
        { bestCandidate: { $exists: false } }
      ],
      $or: [
        { bestCandidateStartedAt: { $exists: false } },
        { bestCandidateStartedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } } // 10 min timeout
      ]
    },
    { $set: { bestCandidateStartedAt: new Date() } },
    { returnDocument: 'after', sort: { bestCandidate: -1, createdAt: -1 } }
  );

  return { job, noMoreJobs: !job && !(await JobPage.exists({
    status: { $in: ['screening', 'interview'] },
    $or: [{ bestCandidate: null }, { bestCandidate: "" }, { bestCandidate: { $exists: false } }]
  })) };
}

async function generateBestCandidate(jobId) {
  const job = await JobPage.findById(jobId);
  if (!job) throw new Error("Job not found");

  const promptPath = path.resolve(process.cwd(), 'prompts/best_candidate.md');
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }
  const promptTemplate = fs.readFileSync(promptPath, 'utf8');

  const vacancyText = `Title: ${job.title}\nCompany: ${job.companyName}\nSalary: ${job.salary || 'N/A'}\n\nDescription:\n${job.description || ''}`;

  const result = await ai.ask(promptTemplate, 'local,gemma,gemini-2.5-flash', {
    description: vacancyText
  });

  if (result) {
    job.bestCandidate = result;
    job.bestCandidateStartedAt = undefined;
    job.updatedAt = new Date();
    await job.save();
    return job;
  } else {
    throw new Error("AI returned empty result");
  }
}

async function runBestCandidateWorker() {
  console.log('\x1b[36m\x1b[1m🦸  BEST CANDIDATE WORKER\x1b[0m');

  await connectMongo();

  try {
    while (true) {
      let job;
      try {
        const result = await claimNextJobForBestCandidate();
        if (result.noMoreJobs) {
          console.log(`No more jobs found for best candidate generation.`);
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

      console.log(`Generating best candidate profile for job: ${job.title} (${job.companyName})`);

      try {
        await generateBestCandidate(job._id);
        console.log(`✅ Successfully generated best candidate profile for ${job.url}`);
      } catch (err) {
        console.error(`Best candidate generation failed for ${job.url}:`, err);
        job.bestCandidateStartedAt = undefined; // Clear lock to allow retry
        await job.save();
      }
    }
  } catch (err) {
    console.error("Best Candidate Worker fatal error:", err);
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
  runBestCandidateWorker().catch(err => {
    console.error(err);
    process.exit(1);
  }).finally(() => {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date());
    console.log(`Job completed at: ${time} (Duration: ${((require('perf_hooks').performance.now() - t0) / 1000).toFixed(2)}s)`);
  });
}

module.exports = { runBestCandidateWorker, generateBestCandidate };
