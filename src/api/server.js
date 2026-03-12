require("dotenv").config();

const http = require("http");
const path = require("path");
const fs = require("fs");
const { connectMongo } = require("../db/mongoose");
const { listJobs, updateJobById, getJobById } = require("./jobsHandler");

const PORT = Number(process.env.PORT) || 4040;

const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.cwd(), process.env.STATIC_DIR)
  : path.resolve(__dirname, "../../frontend/.output/public");

const PATCH_JOBS_RE = /^\/api\/jobs\/([a-f0-9A-F]{24})\/?$/;
const DOWNLOAD_CV_RE = /^\/api\/jobs\/([a-f0-9A-F]{24})\/cv\/?$/;

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

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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

  if (method === "GET" && (pathname === "/api/v1/jobs" || pathname === "/api/jobs")) {
    try {
      const query = parseQuery(url);
      const jobs = await listJobs(query);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(jobs));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
    return;
  }

  const patchMatch = pathname.match(PATCH_JOBS_RE);
  if (method === "PATCH" && patchMatch) {
    const id = patchMatch[1];
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
    const result = await updateJobById(id, body);
    if (result.error) {
      res.writeHead(result.code, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: result.error }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result.job));
    return;
  }

  const downloadCvMatch = pathname.match(DOWNLOAD_CV_RE);
  if (method === "GET" && downloadCvMatch) {
    try {
      const job = await getJobById(downloadCvMatch[1]);
      if (!job) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }

      if (!job.cvUrl) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "cv not found" }));
        return;
      }

      const response = await fetch(job.cvUrl);
      if (!response.ok || !response.body) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "failed to download cv" }));
        return;
      }

      const safeTitle = (job.title || "cv")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "cv";

      res.writeHead(200, {
        "Content-Type": response.headers.get("content-type") || "application/pdf",
        "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
      });

      for await (const chunk of response.body) {
        res.write(chunk);
      }

      res.end();
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
    return;
  }

  if (method === "GET" && STATIC_DIR && fs.existsSync(STATIC_DIR)) {
    const rel = pathname.replace(/^\//, "").replace(/^(\.\.(\/|\\|$))+/, "") || "index.html";
    const resolved = path.resolve(path.join(STATIC_DIR, rel));
    if (!resolved.startsWith(path.resolve(STATIC_DIR))) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    try {
      const stat = fs.statSync(resolved);
      if (stat.isFile()) {
        const ext = path.extname(resolved);
        const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon" };
        res.setHeader("Content-Type", types[ext] || "application/octet-stream");
        res.end(fs.readFileSync(resolved));
        return;
      }
    } catch (_) { }
    const index = path.join(STATIC_DIR, "index.html");
    if (fs.existsSync(index)) {
      res.setHeader("Content-Type", "text/html");
      res.end(fs.readFileSync(index));
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

async function main() {
  await connectMongo();
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
