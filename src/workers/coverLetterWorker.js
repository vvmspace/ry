'use strict';

require("dotenv").config();
const mongoose = require("mongoose");
const fs = require('fs');
const path = require('path');
const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");
const { shouldSkip, setLastTs } = require("../libs/state");
const ai = require("../libs/abstract-ai");

async function runCoverLetterWorker() {
  console.log('\x1b[35m\x1b[1m✉️  COVER LETTER WORKER\x1b[0m');

  // State keys: cover_letter
  if (shouldSkip('COVER_LETTER_SUCCESS_INTERVAL', 'COVER_LETTER_ERROR_INTERVAL', 'cover_letter')) {
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
      console.log(`[coverLetterWorker] Using CV from ${cvPath}`);
    } else if (fs.existsSync(cvExamplePath)) {
      cvText = fs.readFileSync(cvExamplePath, 'utf8');
      console.log(`[coverLetterWorker] Using CV from ${cvExamplePath}`);
    } else {
      throw new Error("No CV file found (full_cv.md or full_cv.example.md)");
    }

    // 2. Load prompt template
    const promptPath = path.resolve(process.cwd(), 'prompts/cover_letter.md');
    if (!fs.existsSync(promptPath)) {
      throw new Error(`Prompt file not found: ${promptPath}`);
    }
    const promptTemplate = fs.readFileSync(promptPath, 'utf8');

    // 3. Find 1 job with status 'saved' or 'generated' and no coverLetter yet
    // Ordered by matchRate desc, createdAt desc
    const job = await JobPage.findOne({
      status: { $in: ['saved', 'generated'] },
      coverLetter: { $exists: false }
    }).sort({ matchRate: -1, createdAt: -1 });

    if (!job) {
      console.log("No jobs found for cover letter generation.");
      setLastTs('error', 'cover_letter');
      return;
    }

    console.log(`Generating cover letter for job: ${job.title} (${job.companyName}) [Rate: ${job.matchRate || 'N/A'}]`);

    const vacancyText = `Title: ${job.title}\nCompany: ${job.companyName}\nSalary: ${job.salary}\n\nDescription:\n${job.description}`;

    console.log(`[coverLetterWorker] Debug: CV length: ${cvText.length} chars`);
    console.log(`[coverLetterWorker] Debug: Vacancy length: ${vacancyText.length} chars`);

    // 4. Use AI service with strict JSON Schema
    const schema = {
      type: 'object',
      properties: {
        reasoning: { type: 'string' },
        cover_letter: { type: 'string' }
      },
      required: ['reasoning', 'cover_letter']
    };

    const result = await ai.json(
      promptTemplate,
      schema,
      'local,gemma-4-31b-it,gemma-4-26b-a4b-it,gemini-2.5-flash',
      {
        cv: cvText,
        vacancy: vacancyText
      }
    );

    if (result && result.cover_letter) {
      if (result.reasoning) {
        console.log('\x1b[36m' + '🔍  AI Reasoning & Strategy:' + '\x1b[0m');
        console.log(result.reasoning);
        console.log('\x1b[36m' + '─'.repeat(50) + '\x1b[0m');
      }

      job.coverLetter = result.cover_letter.trim();
      job.updatedAt = new Date();
      await job.save();
      
      console.log(`✅ Successfully generated cover letter for: ${job.title} at ${job.companyName}`);
      console.log('\x1b[32m' + '📜  Final Cover Letter:' + '\x1b[0m');
      console.log('\x1b[32m' + '─'.repeat(50) + '\x1b[0m');
      console.log(job.coverLetter);
      console.log('\x1b[32m' + '─'.repeat(50) + '\x1b[0m');
      
      setLastTs('success', 'cover_letter');
    } else {
      throw new Error("AI response did not contain cover_letter");
    }

  } catch (err) {
    console.error("Cover Letter Worker failed:", err);
    setLastTs('error', 'cover_letter');
    process.exitCode = 1;
  } finally {
    if (require.main === module) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  runCoverLetterWorker().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runCoverLetterWorker };
