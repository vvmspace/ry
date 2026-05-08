'use strict';

const { listJobs, updateJobById, getJobById, createJob } = require('../jobsHandler');
const { parseQuery, readBody } = require('../utils');
const { generateLegend } = require('../../workers/legendWorker');
const { generateBestCandidate } = require('../../workers/bestCandidateWorker');
const { generateScreeningQuestions } = require('../../workers/screeningQuestionsWorker');

const PATCH_V1_RE     = /^\/api\/v1\/jobs\/(?<id>[a-f0-9A-F]{24})\/?$/;
const CV_V1_RE        = /^\/api\/v1\/jobs\/(?<id>[a-f0-9A-F]{24})\/cv\/?$/;
const PATCH_LEGACY_RE = /^\/api\/jobs\/(?<id>[a-f0-9A-F]{24})\/?$/;
const CV_LEGACY_RE    = /^\/api\/jobs\/(?<id>[a-f0-9A-F]{24})\/cv\/?$/;

async function handleListJobs(req, res) {
  try {
    const jobs = await listJobs(parseQuery(req.url));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(jobs));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

async function handleGetJob(req, res, params) {
  try {
    const job = await getJobById(params.id);
    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(job));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

async function handlePatchJob(req, res, params) {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }
  const result = await updateJobById(params.id, body);
  if (result.error) {
    res.writeHead(result.code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: result.error }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result.job));
}

async function handleCreateJob(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }
  try {
    const result = await createJob(body);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.job));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
  }
}

async function handleDownloadCv(req, res, params) {
  try {
    console.log('[CV Download] Job ID:', params.id);
    const job = await getJobById(params.id);
    console.log('[CV Download] Job found:', !!job, 'cvUrl:', job?.cvUrl, 'cvPdfUrl:', job?.cvPdfUrl);
    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    const targetUrl = job.cvPdfUrl || job.cvUrl;
    if (!targetUrl) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'cv not found' }));
      return;
    }
    const response = await fetch(targetUrl);
    if (!response.ok) {
      console.error('[CV Download] Failed to fetch CV:', response.status, response.statusText);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'failed to download cv', status: response.status }));
      return;
    }
    const safeTitle = (job.title || 'cv')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'cv';
    const buffer = await response.arrayBuffer();
    res.writeHead(200, {
      'Content-Type': response.headers.get('content-type') || 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeTitle}.pdf"`,
      'Content-Length': buffer.byteLength,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });
    res.end(Buffer.from(buffer));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

function redirectToV1(req, res, params) {
  res.writeHead(301, { Location: `/api/v1/jobs/${params.id}` });
  res.end();
}

function redirectCvToV1(req, res, params) {
  res.writeHead(301, { Location: `/api/v1/jobs/${params.id}/cv` });
  res.end();
}

async function handleGenerateLegend(req, res, params) {
  try {
    const updatedJob = await generateLegend(params.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(updatedJob));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
  }
}

async function handleGenerateBestCandidate(req, res, params) {
  try {
    const updatedJob = await generateBestCandidate(params.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(updatedJob));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
  }
}

async function handleGenerateScreeningQuestions(req, res, params) {
  try {
    const updatedJob = await generateScreeningQuestions(params.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(updatedJob));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
  }
}

module.exports = [
  { method: 'GET',   pattern: '/api/v1/jobs',  handler: handleListJobs },
  { method: 'POST',  pattern: '/api/v1/jobs',  handler: handleCreateJob },
  { method: 'GET',   pattern: PATCH_V1_RE,      handler: handleGetJob },
  { method: 'PATCH', pattern: PATCH_V1_RE,      handler: handlePatchJob },
  { method: 'GET',   pattern: CV_V1_RE,         handler: handleDownloadCv },
  { method: 'PATCH', pattern: PATCH_LEGACY_RE,  handler: handlePatchJob },
  { method: 'GET',   pattern: CV_LEGACY_RE,     handler: redirectCvToV1 },
  { method: 'POST',  pattern: /^\/api\/v1\/jobs\/(?<id>[a-f0-9A-F]{24})\/legend\/?$/, handler: handleGenerateLegend },
  { method: 'POST',  pattern: /^\/api\/v1\/jobs\/(?<id>[a-f0-9A-F]{24})\/best_candidate\/?$/, handler: handleGenerateBestCandidate },
  { method: 'POST',  pattern: /^\/api\/v1\/jobs\/(?<id>[a-f0-9A-F]{24})\/screening_questions\/?$/, handler: handleGenerateScreeningQuestions },
];
