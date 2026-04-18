'use strict';

const fs = require('fs');
const path = require('path');
const JobPage = require('../models/jobPage');
const ai = require('../libs/abstract-ai');

/**
 * Load CV text from full_cv.md or full_cv.example.md fallback.
 * Returns empty string if neither exists.
 */
function loadCv() {
  const cvPath = path.resolve(process.cwd(), 'full_cv.md');
  const cvExamplePath = path.resolve(process.cwd(), 'full_cv.example.md');
  if (fs.existsSync(cvPath)) return fs.readFileSync(cvPath, 'utf8');
  if (fs.existsSync(cvExamplePath)) return fs.readFileSync(cvExamplePath, 'utf8');
  return '';
}

/**
 * Load the ask prompt template.
 */
function loadPromptTemplate() {
  const promptPath = path.resolve(process.cwd(), 'prompts/ask.md');
  if (!fs.existsSync(promptPath)) throw new Error(`Prompt file not found: ${promptPath}`);
  return fs.readFileSync(promptPath, 'utf8');
}

/**
 * POST /api/v1/ai/ask
 * Query param: ?applicationUrl=%includes%  (optional)
 *
 * Body:
 * {
 *   "questions": { "Question?": "string"|number|boolean, ... },
 *   "model_and_fallbacks_by_commas": "local,gemma,gemini-2.5-flash"  // optional
 * }
 *
 * Response:
 * { "answers": { "Question?": <answer> } }
 */
async function handleAiAsk(req, res, _params, query) {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const { questions, model_and_fallbacks_by_commas } = body;

  if (!questions || typeof questions !== 'object' || Array.isArray(questions)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '"questions" must be a non-null object' }));
    return;
  }

  const models = model_and_fallbacks_by_commas || 'local,gemma,gemini-2.5-flash';

  try {
    // 1. Load CV
    const cvText = loadCv();

    // 2. Optionally find job by applicationUrl
    let vacancyText = '';
    const applicationUrlFilter = query && query.applicationUrl;
    if (applicationUrlFilter) {
      const job = await JobPage.findOne({
        applicationUrl: { $regex: applicationUrlFilter, $options: 'i' },
      });
      if (job) {
        vacancyText = [
          job.title && `Title: ${job.title}`,
          job.companyName && `Company: ${job.companyName}`,
          job.salary && `Salary: ${job.salary}`,
          job.description && `\nDescription:\n${job.description}`,
          job.greetingMessage && `\nGreeting Message:\n${job.greetingMessage}`,
          job.whyAnswer && `\nWhy Answer:\n${job.whyAnswer}`,
        ].filter(Boolean).join('\n');
      }
    }

    // 3. Build questions block for the prompt
    const questionsBlock = Object.entries(questions)
      .map(([q, hint]) => {
        const type =
          typeof hint === 'boolean' ? 'boolean' :
            typeof hint === 'number' ? 'number' :
              'string';
        return `- "${q}" (expected type: ${type})`;
      })
      .join('\n');

    // 4. Load prompt template and fill variables
    const promptTemplate = loadPromptTemplate();
    const filledPrompt = replaceVariables(promptTemplate, {
      cv: cvText,
      vacancy: vacancyText,
      questions: JSON.stringify(questions),
    });

    console.log(filledPrompt);

    // 5. Build the expected result schema from the questions
    const exampleResult = {};
    for (const [q, hint] of Object.entries(questions)) {
      exampleResult[q] = hint; // keeps the original type hint as example
    }

    // 6. Call AI
    const result = await ai.json(filledPrompt, exampleResult, models);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ answers: result }));
  } catch (err) {
    console.error('[aiHandler] Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error', message: err.message }));
  }
}

/**
 * Read and JSON-parse the request body.
 * Resolves to {} for empty bodies.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Replace variables in template string.
 */
function replaceVariables(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`%${key}%`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

module.exports = { handleAiAsk };
