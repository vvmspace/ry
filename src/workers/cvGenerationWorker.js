require("dotenv").config();

const mongoose = require("mongoose");

const { connectMongo } = require("../db/mongoose");
const JobPage = require("../models/jobPage");

const API_BASE = "https://tma.kingofthehill.pro";
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
    template,
    model,
  };

  const url = `${API_BASE}${GENERATE_CV_PATH}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`generate_cv API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (!data || data.success !== true) {
    throw new Error(data?.message || "generate_cv API returned success: false");
  }

  const pdfUrl = data.pdf_url;
  const cvUrl = buildCvUrl(pdfUrl);
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

  return { cvUrl, greetingMessage, matchRate, email, topTechAndSkills, whyAnswer, data };
}

async function runCvGenerationWorker() {
  await connectMongo();

  const job = await JobPage.findOne({ status: "saved" });
  if (!job) {
    console.log("No saved jobs found. Exiting.");
    return;
  }

  console.log(`Generating CV for job: ${job.url}`);

  try {
    const { cvUrl, greetingMessage, matchRate, email, topTechAndSkills, whyAnswer } = await generateCvForJob(job);
    if (!cvUrl) {
      throw new Error("API did not return pdf_url");
    }

    job.cvUrl = cvUrl;
    job.greetingMessage = greetingMessage;
    job.matchRate = matchRate;
    job.email = email;
    job.topTechAndSkills = topTechAndSkills;
    job.whyAnswer = whyAnswer;
    job.status = "generated";
    await job.save();
    console.log(`CV generated: ${cvUrl} | matchRate: ${matchRate ?? "n/a"}`);
    console.log(formatLogTime());
    console.log("");
  } catch (err) {
    console.error("CV generation failed:", err);
    // job.status = "error";
    // await job.save();
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCvGenerationWorker().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  buildVacancyText,
  buildCvUrl,
  parseMatchRate,
  formatLogTime,
  generateCvForJob,
  runCvGenerationWorker,
};
