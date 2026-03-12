const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  parseSearchUrls,
  extractJobLinksFromHtml,
} = require("./jobsListWorker");

test("parseSearchUrls parses comma separated env var", () => {
  const value = " https://example.com/a ,https://example.com/b,  ";
  const urls = parseSearchUrls(value);

  assert.deepEqual(urls, ["https://example.com/a", "https://example.com/b"]);
});

test("parseSearchUrls throws when env var is missing", () => {
  assert.throws(
    () => parseSearchUrls(""),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /REMOTEYEAH_SEARCH_URLS is not set/);
      return true;
    }
  );
});

test("extractJobLinksFromHtml finds job links and normalizes to absolute", () => {
  const sampleHtml = `
    <html>
      <body>
        <a href="/jobs/123">Job 1</a>
        <a href="https://remoteyeah.com/jobs/456">Job 2</a>
        <a href="#ignore">Ignore</a>
        <a href="javascript:void(0)">Ignore JS</a>
      </body>
    </html>
  `;

  const links = extractJobLinksFromHtml(sampleHtml, "https://remoteyeah.com/remote-nestjs-jobs");

  assert.ok(links.length >= 2);
  assert.ok(
    links.some((l) => l === "https://remoteyeah.com/jobs/123"),
    "relative link should be converted to absolute"
  );
  assert.ok(
    links.some((l) => l === "https://remoteyeah.com/jobs/456"),
    "absolute link should be preserved"
  );
  assert.ok(
    links.every((l) => l.includes("/jobs/")),
    "all links should point to /jobs/ paths"
  );
});

test("extractJobLinksFromHtml works on real example list page", () => {
  const examplePath = path.join(__dirname, "../../jobs_list_page.example.html");

  const html = fs.readFileSync(examplePath, "utf8");
  const links = extractJobLinksFromHtml(html, "https://remoteyeah.com/remote-nestjs-jobs");

  assert.ok(Array.isArray(links));
  assert.ok(links.length > 0, "should find at least one job link");
  assert.ok(
    links.every((l) => l.includes("/jobs/")),
    "all extracted links should be job links"
  );
});

