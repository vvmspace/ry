require('dotenv').config();

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const { connectMongo } = require('../db/mongoose');
const JobPage = require('../models/jobPage');

const QUESTIONS_PATH = path.resolve(process.cwd(), 'questions.json');

async function runAshbyReset() {
  console.log('\x1b[33m\x1b[1m🔄  ASHBY RESET\x1b[0m');

  await connectMongo();

  const result = await JobPage.updateMany(
    { manual: true },
    { $set: { manual: false }, $unset: { additional_questions: '' } }
  );
  console.log(`Updated ${result.modifiedCount} job(s): manual → false`);

  if (fs.existsSync(QUESTIONS_PATH)) {
    fs.unlinkSync(QUESTIONS_PATH);
    console.log('Removed questions.json');
  } else {
    console.log('questions.json not found, skipping');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

runAshbyReset().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date());
    console.log(`Job completed at: ${time} (Duration: ${((require('perf_hooks').performance.now() - t0) / 1000).toFixed(2)}s)`);
  });
