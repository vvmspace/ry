'use strict';

require("dotenv").config();
const mongoose = require("mongoose");
const fs = require('fs');
const path = require('path');
const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");
const { shouldSkip, setLastTs } = require("../libs/state");
const ai = require("../libs/abstract-ai");

async function runMatchRateWorker() {
  console.log('\x1b[36m\x1b[1m📊  MATCH RATE WORKER\x1b[0m');

  // State keys: match_rate
  if (shouldSkip('MATCH_RATE_SUCCESS_INTERVAL', 'MATCH_RATE_ERROR_INTERVAL', 'match_rate')) {
    process.exit(0);
  }

  await connectMongo();

  try {
    // 1. Get CV content
    let cvText = '';
    const cvPath = path.resolve(process.cwd(), 'full_cv.md');
    const cvExamplePath = path.resolve(process.cwd(), 'full_cv.example.md');

    if (fs.existsSync(cvPath)) {
      cvText = fs.readFileSync(cvPath, 'utf8');
      console.log(`[matchRateWorker] Using CV from ${cvPath}`);
    } else if (fs.existsSync(cvExamplePath)) {
      cvText = fs.readFileSync(cvExamplePath, 'utf8');
      console.log(`[matchRateWorker] Using CV from ${cvExamplePath}`);
    } else {
      throw new Error("No CV file found (full_cv.md or full_cv.example.md)");
    }

    // 2. Load prompt template
    const promptPath = path.resolve(process.cwd(), 'prompts/rate.md');
    if (!fs.existsSync(promptPath)) {
      throw new Error(`Prompt file not found: ${promptPath}`);
    }
    const promptTemplate = fs.readFileSync(promptPath, 'utf8');

    // 3. Find 1 job with status not 'pending' and not 'expired', ordered by oldest first
    const job = await JobPage.findOne({
      status: {
        $nin: ['pending', 'expired', 'applied', 'error', 'saved', 'cancelled']
      }
    }).sort({ updatedAt: 1 });

    if (!job) {
      console.log("No jobs found for match rate calculation.");
      setLastTs('error', 'match_rate');
      return;
    }

    console.log(`Calculating match rate for job: ${job.title} (${job.companyName})`);

    const vacancyText = `Title: ${job.title}\nCompany: ${job.companyName}\nSalary: ${job.salary}\n\nDescription:\n${job.description}`;

    // 4. Use AI service with strict JSON Schema
    const schema = {
      type: 'object',
      properties: {
        match_rate: { type: 'integer' },
        comment: { type: 'string' }
      },
      required: ['match_rate', 'comment']
    };

    const result = await ai.json(promptTemplate, schema, 'local,gemma-4-31b-it,gemma-4-26b-a4b-it,gemini-2.5-flash', {
      cv: cvText,
      vacancy: vacancyText,
      locations: (job.locations || []).join(', ')
    });

    if (result && typeof result.match_rate !== 'undefined') {
      const rate = parseInt(result.match_rate, 10);
      if (isNaN(rate)) {
        throw new Error(`AI returned invalid match_rate: ${result.match_rate}`);
      }
      // green apple if not changed
      let icon = job.matchRate == rate ? '🍏' : job.matchRate < rate ? '🔥' : '🧊';
      job.matchRate = rate;
      job.matchRateComment = result.comment;
      job.updatedAt = new Date(); // Force updatedAt update
      await job.save();
      console.log(`${icon} Successfully updated match rate: ${job.matchRate}% (${job.status}) for ${job.url}`);
      if (result.comment) {
        console.log(`💬 AI Comment: ${result.comment}`);
      }
      setLastTs('success', 'match_rate');
    } else {
      console.log('[matchRateWorker] AI result:', result);
      throw new Error("AI response did not contain match_rate");
    }

  } catch (err) {
    console.error("Match Rate Worker failed:", err);
    setLastTs('error', 'match_rate');
    process.exitCode = 1;
  } finally {
    // Check if we are the main module to decide on disconnect
    if (require.main === module) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  const t0 = require('perf_hooks').performance.now();
  console.log(`Job started at: ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date())}`);
  runMatchRateWorker().catch(err => {
    console.error(err);
    process.exit(1);
  }).finally(() => {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date());
    console.log(`Job completed at: ${time} (Duration: ${((require('perf_hooks').performance.now() - t0) / 1000).toFixed(2)}s)`);
  });
}

module.exports = { runMatchRateWorker };
