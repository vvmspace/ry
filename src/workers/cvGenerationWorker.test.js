const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildVacancyText,
  buildCvUrl,
  parseMatchRate,
  formatLogTime,
  generateCvForJob,
} = require("./cvGenerationWorker");

test("buildVacancyText concatenates job fields", () => {
  const job = {
    title: "Senior Dev",
    companyName: "Acme",
    salary: "100k",
    description: "Do stuff.",
  };
  const text = buildVacancyText(job);
  assert.ok(text.includes("Senior Dev"));
  assert.ok(text.includes("Acme"));
  assert.ok(text.includes("100k"));
  assert.ok(text.includes("Do stuff."));
});

test("buildVacancyText handles missing fields", () => {
  const text = buildVacancyText({});
  assert.equal(text, "");
});

test("buildCvUrl builds absolute URL from path", () => {
  assert.equal(
    buildCvUrl("/uploads/cv/abc.pdf"),
    "https://tma.kingofthehill.pro/uploads/cv/abc.pdf"
  );
});

test("buildCvUrl adds slash when path has no leading slash", () => {
  assert.equal(
    buildCvUrl("uploads/cv/abc.pdf"),
    "https://tma.kingofthehill.pro/uploads/cv/abc.pdf"
  );
});

test("buildCvUrl returns null for empty input", () => {
  assert.equal(buildCvUrl(""), null);
  assert.equal(buildCvUrl(null), null);
});

test("parseMatchRate handles number and string input", () => {
  assert.equal(parseMatchRate(87), 87);
  assert.equal(parseMatchRate("91"), 91);
  assert.equal(parseMatchRate("73%"), 73);
  assert.equal(parseMatchRate(""), null);
  assert.equal(parseMatchRate("n/a"), null);
});

test("formatLogTime returns compact lowercase time", () => {
  const date = new Date("2026-03-12T23:28:00Z");
  assert.match(formatLogTime(date), /^\d{1,2}:\d{2}(am|pm)$/);
});

test("generateCvForJob calls API and returns cvUrl, greetingMessage and matchRate", async () => {
  const job = {
    title: "Dev",
    companyName: "Co",
    description: "Desc",
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    assert.equal(url, "https://tma.kingofthehill.pro/api/v1/generate_cv");
    assert.equal(opts.method, "POST");
    const body = JSON.parse(opts.body);
    assert.equal(body.template, "dark_calendly");
    assert.equal(body.model, "gemini-3.1-pro-preview");
    assert.ok(body.vacancy_text.includes("Dev"));

    return {
      ok: true,
      json: async () => ({
        success: true,
        pdf_url: "/files/cv/123.pdf",
        greeting_message: "Hello from API",
        match_rate: "88",
      }),
    };
  };

  try {
    const { cvUrl, greetingMessage, matchRate } = await generateCvForJob(job);
    assert.equal(cvUrl, "https://tma.kingofthehill.pro/files/cv/123.pdf");
    assert.equal(greetingMessage, "Hello from API");
    assert.equal(matchRate, 88);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateCvForJob throws when job has no text", async () => {
  await assert.rejects(
    () => generateCvForJob({}),
    /no text to generate CV from/
  );
});

test("generateCvForJob throws when API returns success false", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ success: false }),
  });

  try {
    await assert.rejects(
      () => generateCvForJob({ title: "x" }),
      /success: false/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
