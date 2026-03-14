'use strict';

const { listJobs, updateJobById, getJobById } = require('../jobsHandler');
const { parseQuery, readBody } = require('../utils');

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

async function handleDownloadCv(req, res, params) {
  try {
    console.log('[CV Download] Job ID:', params.id);
    const job = await getJobById(params.id);
    console.log('[CV Download] Job found:', !!job, 'cvUrl:', job?.cvUrl);
    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    if (!job.cvUrl) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'cv not found' }));
      return;
    }
    const response = await fetch(job.cvUrl);
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

module.exports = [
  { method: 'GET',   pattern: '/api/v1/jobs',  handler: handleListJobs },
  { method: 'PATCH', pattern: PATCH_V1_RE,      handler: handlePatchJob },
  { method: 'GET',   pattern: CV_V1_RE,         handler: handleDownloadCv },
  { method: 'PATCH', pattern: PATCH_LEGACY_RE,  handler: redirectToV1 },
  { method: 'GET',   pattern: CV_LEGACY_RE,     handler: redirectCvToV1 },
];
