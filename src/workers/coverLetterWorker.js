'use strict';

require("dotenv").config();
const mongoose = require("mongoose");
const fs = require('fs');
const path = require('path');
const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");
const { shouldSkip, setLastTs, getIterationsFromArgs } = require("../libs/state");
const ai = require("../libs/abstract-ai");

async function claimNextJobForCoverLetter() {
  const job = await JobPage.findOneAndUpdate(
    {
      status: { $in: ['saved', 'generated'] },
      coverLetter: { $exists: false },
      $or: [
        { coverLetterStartedAt: { $exists: false } },
        { coverLetterStartedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } } // 10 min timeout
      ]
    },
    { $set: { coverLetterStartedAt: new Date() } },
    { returnDocument: 'after', sort: { matchRate: -1, createdAt: -1 } }
  );

  return { 
    job, 
    noMoreJobs: !job && !(await JobPage.exists({ 
      status: { $in: ['saved', 'generated'] }, 
      coverLetter: { $exists: false } 
    })) 
  };
}

async function generateCoverLetter(job, cvText, promptTemplate) {
  const vacancyText = `Title: ${job.title}\nCompany: ${job.companyName}\nSalary: ${job.salary}\n\nDescription:\n${job.description}`;
  const schema = {
    type: 'object',
    properties: {
      reasoning: { type: 'string' },
      cover_letter: { type: 'string' }
    },
    required: ['reasoning', 'cover_letter']
  };

  let result;
  let retries = 3;
  let delay = 2000;

  while (retries > 0) {
    try {
      result = await ai.json(
        promptTemplate,
        schema,
        'local,gemma-4-31b-it,gemma-4-26b-a4b-it,gemini-2.5-flash',
        { cv: cvText, vacancy: vacancyText }
      );
      if (result && result.cover_letter) break;
      throw new Error("AI response did not contain cover_letter");
    } catch (err) {
      retries--;
      if (retries === 0) throw err;
      console.warn(`AI Error (retries left: ${retries}): ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }

  job.coverLetter = result.cover_letter.trim();
  job.coverLetterStartedAt = undefined;
  job.updatedAt = new Date();
  await job.save();
  return job;
}

async function generateCoverLetterById(jobId) {
  await connectMongo();
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

  const promptPath = path.resolve(process.cwd(), 'prompts/cover_letter.md');
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }
  const promptTemplate = fs.readFileSync(promptPath, 'utf8');

  return await generateCoverLetter(job, cvText, promptTemplate);
}

async function runCoverLetterWorker() {
  console.log('\x1b[35m\x1b[1m✉️  COVER LETTER WORKER\x1b[0m');

  if (shouldSkip('COVER_LETTER_SUCCESS_INTERVAL', 'COVER_LETTER_ERROR_INTERVAL', 'cover_letter')) {
    process.exit(0);
  }

  await connectMongo();

  try {
    let cvText = '';
    const cvPath = path.resolve(process.cwd(), 'full_cv.md');
    const cvExamplePath = path.resolve(process.cwd(), 'full_cv.example.md');

    if (fs.existsSync(cvPath)) {
      cvText = fs.readFileSync(cvPath, 'utf8');
      console.log(`[coverLetterWorker] Using CV from ${cvPath}`);
    } else if (fs.existsSync(cvExamplePath)) {
      cvText = fs.readFileSync(cvExamplePath, 'utf8');
      console.log(`[coverLetterWorker] Using CV from ${cvExamplePath}`);
    } else {
      throw new Error("No CV file found (full_cv.md or full_cv.example.md)");
    }

    const promptPath = path.resolve(process.cwd(), 'prompts/cover_letter.md');
    if (!fs.existsSync(promptPath)) {
      throw new Error(`Prompt file not found: ${promptPath}`);
    }
    const promptTemplate = fs.readFileSync(promptPath, 'utf8');

    const iterations = getIterationsFromArgs();
    const threads = iterations > 1 ? Math.min(iterations, 5) : 1;
    console.log(`[coverLetterWorker] Running ${iterations} iteration(s) with ${threads} thread(s)`);

    let claimedCount = 0;
    let successCount = 0;

    const runWorker = async (workerId) => {
      if (workerId > 1) {
        await new Promise(r => setTimeout(r, (workerId - 1) * 1500));
      }

      while (true) {
        if (claimedCount >= iterations) break;

        let job;
        try {
          const result = await claimNextJobForCoverLetter();
          if (result.noMoreJobs) {
            console.log(`[Worker ${workerId}] No more jobs found for cover letter generation.`);
            break;
          }
          if (!result.job) continue;
          job = result.job;
        } catch (err) {
          console.error(`[Worker ${workerId}] Failed to fetch/claim job from DB:`, err);
          break;
        }

        claimedCount++;
        console.log(`[Worker ${workerId}] Generating cover letter (${claimedCount}/${iterations}) for: ${job.title} (${job.companyName})`);

        try {
          await generateCoverLetter(job, cvText, promptTemplate);
          console.log(`[Worker ${workerId}] ✅ Successfully generated cover letter for: ${job.title}`);
          successCount++;
        } catch (err) {
          console.error(`[Worker ${workerId}] Cover letter generation failed for ${job.url}:`, err);
          job.coverLetterStartedAt = undefined;
          await job.save();
        }
      }
    };

    const workers = [];
    for (let i = 0; i < threads; i++) {
      workers.push(runWorker(i + 1));
    }
    await Promise.all(workers);

    if (successCount > 0) {
      setLastTs('success', 'cover_letter');
    } else {
      setLastTs('error', 'cover_letter');
    }

  } catch (err) {
    console.error("Cover Letter Worker fatal error:", err);
    setLastTs('error', 'cover_letter');
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
  runCoverLetterWorker().catch(err => {
    console.error(err);
    process.exit(1);
  }).finally(() => {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date());
    console.log(`Job completed at: ${time} (Duration: ${((require('perf_hooks').performance.now() - t0) / 1000).toFixed(2)}s)`);
  });
}

module.exports = { runCoverLetterWorker, generateCoverLetterById };
