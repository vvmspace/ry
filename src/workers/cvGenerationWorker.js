require("dotenv").config();

const mongoose = require("mongoose");

const fs = require('fs');
const path = require('path');

const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");
const { shouldSkip, setLastTs, getIterationsFromArgs } = require("../libs/state");

const PRIORITY_PATH = path.resolve(process.cwd(), 'priority.json');

function loadPriority(section) {
  try {
    const raw = fs.readFileSync(PRIORITY_PATH, 'utf8');
    return JSON.parse(raw)?.[section] ?? {};
  } catch {
    return {};
  }
}

/**
 * Build aggregate pipeline that picks 1 `saved` job ordered by:
 * 1. count of priority filter matches (desc)
 * 2. matchRate (desc)
 * 3. createdAt (desc)
 */
async function findNextSavedJob(priority) {
  // Build $addFields expressions: one $cond per filter string per field
  const scoreExprs = [];

  for (const [field, values] of Object.entries(priority)) {
    if (!Array.isArray(values)) continue;
    for (const val of values) {
      if (!val) continue;
      const regex = val.toLowerCase();
      scoreExprs.push({
        $cond: [
          { $regexMatch: { input: { $toLower: { $ifNull: [`$${field}`, ''] } }, regex } },
          1,
          0,
        ],
      });
    }
  }

  if (!scoreExprs.length) {
    // No priority rules — simple findOne
    return JobPage.findOne({ status: 'saved' }).sort({ matchRate: -1, createdAt: -1 });
  }

  const priorityScore = scoreExprs.length === 1
    ? scoreExprs[0]
    : { $add: scoreExprs };

  const [doc] = await JobPage.aggregate([
    { $match: { status: 'saved' } },
    { $addFields: { _priorityScore: priorityScore } },
    { $sort: { _priorityScore: -1, matchRate: -1, createdAt: -1 } },
    { $limit: 1 },
  ]).allowDiskUse(true);

  return doc ? JobPage.findById(doc._id) : null;
}

const API_BASE = process.env.GENERATE_CV_API_BASE || "https://tma.kingofthehill.pro";
const GENERATE_CV_PATH = "/api/v1/generate_cv";

function buildVacancyText(job) {
  const parts = [];
  if (job.title) parts.push(`Title: ${job.title}`);
  if (job.companyName) parts.push(`Company: ${job.companyName}`);
  if (job.salary) parts.push(`Salary: ${job.salary}`);
  if (job.description) parts.push(job.description);
  return parts.join("\n\n").trim() || "";
}

function buildCvUrl(pdfUrl) {
  if (!pdfUrl || typeof pdfUrl !== "string") return null;
  const path = pdfUrl.startsWith("/") ? pdfUrl : `/${pdfUrl}`;
  return `${API_BASE}${path}`;
}

function parseMatchRate(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace("%", "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatLogTime(date = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return formatted.replace(/\s/g, "").toLowerCase();
}

async function generateCvForJob(job, options = {}) {
  const template = options.template ?? process.env.CV_TEMPLATE ?? "dark_calendly";
  const model = options.model ?? process.env.CV_MODEL ?? "gemini-3.1-pro-preview";

  const vacancyText = buildVacancyText(job);
  if (!vacancyText) {
    throw new Error("Job has no text to generate CV from");
  }

  const body = {
    vacancy_text: vacancyText,
    template: template,
    model,
  };

  if (job.cvGenerationComment) {
    body.custom_comment = job.cvGenerationComment;
  }

  const url = `${API_BASE}${GENERATE_CV_PATH}`;

  console.log("API Request:", JSON.stringify({
    method: "POST",
    url: url,
    body: {
      ...body,
      vacancy_text: body.vacancy_text.substring(0, 150) + "..."
    }
  }, null, 2));

  let res;
  let retries = 3;
  let delay = 2000;

  while (retries > 0) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) break;

      const text = await res.text();
      console.warn(`[generateCvForJob] API error ${res.status} (retries left: ${retries - 1}): ${text}`);

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        // Retry on rate limit or server errors
        retries--;
        if (retries === 0) throw new Error(`generate_cv API error ${res.status}: ${text}`);
        console.log(`[generateCvForJob] Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2.5; // Exponential backoff
        continue;
      } else {
        // Fatal error, don't retry
        throw new Error(`generate_cv API error ${res.status}: ${text}`);
      }
    } catch (err) {
      if (retries === 0) throw err;
      console.warn(`[generateCvForJob] Fetch error (retries left: ${retries - 1}): ${err.message}`);
      retries--;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2.5;
    }
  }

  const data = await res.json();
  if (!data || data.success !== true) {
    throw new Error(data?.message || "generate_cv API returned success: false");
  }

  const pdfUrl = data.pdf_url;
  const htmlUrl = data.html_url;
  const cvUrl = buildCvUrl(pdfUrl);
  const cvHtmlUrl = buildCvUrl(htmlUrl);
  const cvPdfUrl = cvUrl;
  const greetingMessage =
    typeof data.greeting_message === "string" && data.greeting_message.trim()
      ? data.greeting_message.trim()
      : "";
  const matchRate = parseMatchRate(data.match_rate);
  const email =
    typeof data.email === "string" && data.email.trim()
      ? data.email.trim()
      : "";
  const topTechAndSkills =
    typeof data.top_tech_and_skills === "string" && data.top_tech_and_skills.trim()
      ? data.top_tech_and_skills.trim()
      : "";
  const whyAnswer =
    typeof data.why_answer === "string" && data.why_answer.trim()
      ? data.why_answer.trim()
      : "";
  const jsonUrl = data.json_url;

  return { cvUrl, cvHtmlUrl, cvPdfUrl, greetingMessage, matchRate, email, topTechAndSkills, whyAnswer, jsonUrl, data };
}

async function claimNextSavedJob(priority) {
  const doc = await findNextSavedJob(priority);
  if (!doc) return { job: null, noMoreJobs: true };

  const job = await JobPage.findOneAndUpdate(
    { _id: doc._id, status: 'saved' },
    { $set: { status: 'generating', updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  return { job, noMoreJobs: false };
}

async function runCvGenerationWorker() {
  console.log('\x1b[35m\x1b[1m🤖  CV GENERATION WORKER\x1b[0m');
  if (shouldSkip('GENERATED_SUCCESS_INTERVAL', 'GENERATED_ERROR_INTERVAL', 'generated')) {
    process.exit(0);
  }

  await connectMongo();

  const iterations = getIterationsFromArgs();
  const threads = iterations > 1 ? Math.min(iterations, 5) : 1;
  console.log(`[cvGenerationWorker] Running ${iterations} iteration(s) with ${threads} thread(s)`);

  let claimedCount = 0;
  let successCount = 0;

  const runWorker = async (workerId) => {
    // Stagger starts to reduce instantaneous load
    if (workerId > 1) {
      const staggerDelay = (workerId - 1) * 2000;
      console.log(`[Worker ${workerId}] Staggering start by ${staggerDelay}ms...`);
      await new Promise(r => setTimeout(r, staggerDelay));
    }

    while (true) {
      if (claimedCount >= iterations) break;

      let job;
      try {
        const priority = loadPriority('generate');
        const result = await claimNextSavedJob(priority);
        if (result.noMoreJobs) {
          console.log(`[Worker ${workerId}] No more saved jobs found.`);
          break;
        }
        if (!result.job) {
          // Race condition: another worker claimed the job between find and update.
          // Just continue to try and pick the next available job.
          continue;
        }
        job = result.job;
      } catch (err) {
        console.error(`[Worker ${workerId}] Failed to fetch/claim job from DB:`, err);
        break;
      }

      claimedCount++;
      console.log(`[Worker ${workerId}] Generating CV for job (${claimedCount}/${iterations}): ${job.url}`);

      try {
        const { cvUrl, cvHtmlUrl, cvPdfUrl, greetingMessage, matchRate, email, topTechAndSkills, whyAnswer, jsonUrl } = await generateCvForJob(job);
        if (!cvUrl) {
          throw new Error("API did not return pdf_url");
        }

        job.cvUrl = cvUrl;
        job.cvHtmlUrl = cvHtmlUrl;
        job.cvPdfUrl = cvPdfUrl;
        job.greetingMessage = greetingMessage;
        if (job.matchRate === undefined || job.matchRate === null) {
          job.matchRate = matchRate;
        }
        job.email = email;
        job.topTechAndSkills = topTechAndSkills;
        job.whyAnswer = whyAnswer;
        if (jsonUrl) {
          const formattedJsonUrl = buildCvUrl(jsonUrl);
          job.jsonUrl = formattedJsonUrl;
          job.cvJsonUrl = formattedJsonUrl;
        }
        job.status = "generated";
        await job.save();

        console.log(`[Worker ${workerId}] CV generated: ${cvUrl} | matchRate: ${matchRate ?? "n/a"}`);
        successCount++;
      } catch (err) {
        console.error(`[Worker ${workerId}] CV generation failed for ${job.url}:`, err);
        // Reset status to saved so it can be retried, or set to error? 
        // Spec says "in case of error ... state.last.error.generated"
        // Let's set it to 'saved' but maybe add a retry count or just let it be.
        // Actually, to prevent infinite loops on same error job, 'error' status is safer.
        job.status = "error";
        await job.save();
      }
    }
  };

  try {
    const workers = [];
    for (let i = 0; i < threads; i++) {
      workers.push(runWorker(i + 1));
    }
    await Promise.all(workers);

    if (successCount > 0) {
      setLastTs('success', 'generated');
    } else if (claimedCount === 0) {
      // No jobs found at all
      setLastTs('error', 'generated');
    } else {
      // Jobs found but all failed
      setLastTs('error', 'generated');
    }
  } catch (err) {
    console.error("CV generation worker fatal error:", err);
    setLastTs('error', 'generated');
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

async function generateCvById(jobId) {
  const job = await JobPage.findById(jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  const {
    cvUrl,
    cvHtmlUrl,
    cvPdfUrl,
    greetingMessage,
    matchRate,
    email,
    topTechAndSkills,
    whyAnswer,
    jsonUrl
  } = await generateCvForJob(job);

  if (!cvUrl) {
    throw new Error("API did not return pdf_url");
  }

  job.cvUrl = cvUrl;
  job.cvHtmlUrl = cvHtmlUrl;
  job.cvPdfUrl = cvPdfUrl;
  job.greetingMessage = greetingMessage;
  if (job.matchRate === undefined || job.matchRate === null) {
    job.matchRate = matchRate;
  }
  job.email = email;
  job.topTechAndSkills = topTechAndSkills;
  job.whyAnswer = whyAnswer;
  if (jsonUrl) {
    const formattedJsonUrl = buildCvUrl(jsonUrl);
    job.jsonUrl = formattedJsonUrl;
    job.cvJsonUrl = formattedJsonUrl;
  }
  job.status = "generated";
  job.updatedAt = new Date();
  await job.save();

  return job;
}

if (require.main === module) {
  const t0 = require('perf_hooks').performance.now();
  console.log(`Job started at: ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date())}`);
  runCvGenerationWorker().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  }).finally(() => {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date());
    console.log(`Job completed at: ${time} (Duration: ${((require('perf_hooks').performance.now() - t0) / 1000).toFixed(2)}s)`);
  });
}

module.exports = {
  buildVacancyText,
  buildCvUrl,
  parseMatchRate,
  formatLogTime,
  generateCvForJob,
  generateCvById,
  runCvGenerationWorker,
};
