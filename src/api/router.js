/**
 * Central request dispatcher.
 * Applies CORS, handles OPTIONS preflight, then iterates registered routes
 * in order and delegates to the first match.
 *
 * Route files are created in task 7. Until then the arrays below are empty
 * placeholders so this module loads without errors.
 */

// Route registration order matters — more specific routes must come before
// catch-all routes (e.g. static must be last).
const routes = [
  ...require('./routes/jobs'),
  ...require('./routes/stats'),
  ...require('./routes/metrics'),
  ...require('./routes/profiles'),
  ...require('./routes/static'),
];

/**
 * Set CORS headers on the response.
 * @param {import('http').ServerResponse} res
 */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
}

/**
 * Main request handler — passed directly to http.createServer().
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
async function handleRequest(req, res) {
  const url = req.url || "/";
  const pathname = url.split("?")[0];
  const method = req.method;

  cors(res);

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  for (const { method: m, pattern, handler } of routes) {
    if (m !== method && m !== "*") continue;

    let params = null;
    if (typeof pattern === "string") {
      params = pathname === pattern ? {} : null;
    } else {
      // RegExp — use named capture groups as params
      const match = pattern.exec(pathname);
      params = match ? (match.groups ?? {}) : null;
    }

    if (params !== null) {
      await handler(req, res, params);
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

module.exports = { handleRequest };
