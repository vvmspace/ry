'use strict';

const path = require('path');
const fs = require('fs');

const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.cwd(), process.env.STATIC_DIR)
  : path.resolve(__dirname, '../../../frontend/.output/public');


const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

function handleStatic(req, res) {
  const url = req.url || '/';
  const pathname = url.split('?')[0];

  if (!STATIC_DIR || !fs.existsSync(STATIC_DIR)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const rel = pathname.replace(/^\//, '').replace(/^(\.\.(\/|\\|$))+/, '') || 'index.html';
  const resolved = path.resolve(path.join(STATIC_DIR, rel));

  const baseResolved = path.resolve(STATIC_DIR);
  if (!resolved.startsWith(baseResolved)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
      const ext = path.extname(resolved);
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      res.end(fs.readFileSync(resolved));
      return;
    }
  } catch (_) {}

  const index = path.join(STATIC_DIR, 'index.html');
  if (fs.existsSync(index)) {
    res.setHeader('Content-Type', 'text/html');
    res.end(fs.readFileSync(index));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = [{ method: '*', pattern: /^\/.*$/, handler: handleStatic }];
