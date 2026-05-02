'use strict';

const { handleAiAsk } = require('../aiHandler');
const { parseQuery } = require('../utils');

/**
 * Wraps handleAiAsk so the router can call it with (req, res, params).
 * We pull the query string here and forward it as the 4th argument.
 */
async function askRoute(req, res, params) {
  const query = parseQuery(req.url);
  return handleAiAsk(req, res, params, query);
}

module.exports = [
  { method: 'POST', pattern: '/api/v1/ai/ask', handler: askRoute },
];
