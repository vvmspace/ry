const test = require("node:test");
const assert = require("node:assert/strict");

const { buildJobsFilter, escapeRegex, listJobs, updateJobById } = require("./jobsHandler");
const JobPage = require("../models/jobPage");

test("escapeRegex escapes special regex chars", () => {
  assert.equal(escapeRegex("a.b"), "a\\.b");
  assert.equal(escapeRegex("(x)"), "\\(x\\)");
});

test("buildJobsFilter empty params returns empty filter", () => {
  assert.deepEqual(buildJobsFilter({}), {});
});

test("buildJobsFilter status", () => {
  assert.deepEqual(buildJobsFilter({ status: "saved" }), {
    $and: [{ status: "saved" }],
  });
});

test("buildJobsFilter query", () => {
  const filter = buildJobsFilter({ query: "node" });
  assert.ok(filter.$and);
  const orCondition = filter.$and.find((condition) => condition.$or);
  assert.ok(orCondition);
  assert.equal(orCondition.$or.length, 2);
});

test("buildJobsFilter exclude", () => {
  const filter = buildJobsFilter({ exclude: "ruby" });
  assert.ok(filter.$and);
  assert.ok(filter.$and.some((condition) => condition.title && condition.title.$not));
  assert.ok(filter.$and.some((condition) => condition.description && condition.description.$not));
});

test("buildJobsFilter domain", () => {
  const filter = buildJobsFilter({ domain: "example.com" });
  assert.ok(filter.$and);
  assert.ok(filter.$and.some((condition) => condition.domain));
});

test("buildJobsFilter combines multiple", () => {
  const filter = buildJobsFilter({
    status: "saved",
    query: "js",
    domain: "company.com",
  });
  assert.ok(filter.$and.length >= 3);
});

test("listJobs builds aggregation with generated-first sort", async () => {
  const originalAggregate = JobPage.aggregate;
  let capturedPipeline = null;

  JobPage.aggregate = async (pipeline) => {
    capturedPipeline = pipeline;
    return [{ _id: "job-1", status: "generated" }];
  };

  try {
    const jobs = await listJobs({ status: "generated", domain: "example.com" });
    assert.deepEqual(jobs, [{ _id: "job-1", status: "generated" }]);
    assert.ok(Array.isArray(capturedPipeline));
    assert.deepEqual(capturedPipeline[0], {
      $match: buildJobsFilter({ status: "generated", domain: "example.com" }),
    });
    assert.deepEqual(capturedPipeline[2], {
      $sort: { sortGeneratedFirst: 1, updatedAt: -1 },
    });
  } finally {
    JobPage.aggregate = originalAggregate;
  }
});

test("updateJobById invalid status returns 400", async () => {
  const result = await updateJobById("507f1f77bcf86cd799439011", {});
  assert.equal(result.code, 400);

  const secondResult = await updateJobById("507f1f77bcf86cd799439011", { status: "invalid" });
  assert.equal(secondResult.code, 400);
});

test("updateJobById not found returns 404", async () => {
  const originalFindByIdAndUpdate = JobPage.findByIdAndUpdate;
  JobPage.findByIdAndUpdate = () => ({
    lean: async () => null,
  });

  try {
    const result = await updateJobById("507f1f77bcf86cd799439011", { status: "cancelled" });
    assert.equal(result.code, 404);
  } finally {
    JobPage.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test("updateJobById updates and returns job", async () => {
  const originalFindByIdAndUpdate = JobPage.findByIdAndUpdate;
  JobPage.findByIdAndUpdate = (id, update, options) => ({
    lean: async () => ({
      _id: id,
      status: update.status,
      options,
    }),
  });

  try {
    const result = await updateJobById("507f1f77bcf86cd799439011", { status: "applied" });
    assert.ok(!result.error);
    assert.equal(result.job.status, "applied");
    assert.equal(result.job.options.returnDocument, "after");
    assert.equal(result.job.options.runValidators, true);
  } finally {
    JobPage.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});
