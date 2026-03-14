/**
 * Shared API utilities extracted from server.js
 */

/**
 * Parse query string parameters from a URL string.
 * @param {string} url
 * @returns {Record<string, string>}
 */
function parseQuery(url) {
  const i = url.indexOf("?");
  if (i === -1) return {};
  const params = new URLSearchParams(url.slice(i));
  const out = {};
  for (const [k, v] of params) {
    out[k] = v;
  }
  return out;
}

/**
 * Read and JSON-parse the request body.
 * Resolves to {} for empty bodies.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<object>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

module.exports = { parseQuery, readBody };
