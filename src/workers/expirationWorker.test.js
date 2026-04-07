const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isExpirationSignal,
  isNotFoundRedirect,
  getCheckUrl,
} = require("./expirationWorker");

test("isExpirationSignal marks HTTP 404 as expired", () => {
  assert.equal(isExpirationSignal(404, "ok"), true);
});

test("isExpirationSignal marks body with 'not found' as expired", () => {
  assert.equal(isExpirationSignal(200, "The requested page was Not Found"), true);
});

test("isExpirationSignal marks body with 'no longer available' as expired", () => {
  assert.equal(isExpirationSignal(200, "This job is no longer available"), true);
});

test("isExpirationSignal ignores healthy responses", () => {
  assert.equal(isExpirationSignal(200, "Welcome"), false);
});

test("isNotFoundRedirect detects ?not_found=true", () => {
  assert.equal(isNotFoundRedirect("https://example.com/apply?not_found=true"), true);
});

test("isNotFoundRedirect is case insensitive for value", () => {
  assert.equal(isNotFoundRedirect("https://example.com/apply?not_found=True"), true);
});

test("isNotFoundRedirect ignores unrelated query", () => {
  assert.equal(isNotFoundRedirect("https://example.com/apply?x=1"), false);
});

test("getCheckUrl prefers applicationUrl and falls back to url", () => {
  assert.equal(
    getCheckUrl({ applicationUrl: "https://apply.example.com", url: "https://job.example.com" }),
    "https://apply.example.com"
  );

  assert.equal(
    getCheckUrl({ applicationUrl: "", url: "https://job.example.com" }),
    "https://job.example.com"
  );
});
