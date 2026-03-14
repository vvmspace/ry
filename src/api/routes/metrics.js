'use strict';

const { register } = require('../../metrics/jobMetrics');

async function handleMetrics(req, res) {
  const metrics = await register.metrics();
  res.writeHead(200, { 'Content-Type': register.contentType });
  res.end(metrics);
}

module.exports = [
  { method: 'GET', pattern: '/metrics', handler: handleMetrics },
];
