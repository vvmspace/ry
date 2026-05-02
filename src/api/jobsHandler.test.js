const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildJobsFilter,
  escapeRegex,
  listJobs,
  parsePositiveInt,
  updateJobById,
  STATUS_SORT_ORDER,
} = require("./jobsHandler");
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

test("parsePositiveInt returns fallback for invalid values and clamps range", () => {
  assert.equal(parsePositiveInt(undefined, 5), 5);
  assert.equal(parsePositiveInt("abc", 5), 5);
  assert.equal(parsePositiveInt("3", 5), 3);
  assert.equal(parsePositiveInt("0", 5, { min: 1, max: 10 }), 1);
  assert.equal(parsePositiveInt("99", 5, { min: 1, max: 10 }), 10);
});

test("listJobs builds aggregation with sort and pagination", async () => {
  const originalAggregate = JobPage.aggregate;
  let capturedPipeline = null;

  JobPage.aggregate = async (pipeline) => {
    capturedPipeline = pipeline;
    return [{ items: [{ _id: "job-1", status: "generated", matchRate: 92 }], total: 1 }];
  };

  try {
    const jobs = await listJobs({ status: "generated", domain: "example.com", page: "2", limit: "10" });
    assert.deepEqual(jobs, {
      items: [{ _id: "job-1", status: "generated", matchRate: 92 }],
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
      hasPrevPage: true,
      hasNextPage: false,
    });
    assert.ok(Array.isArray(capturedPipeline));
    assert.deepEqual(capturedPipeline[0], {
      $match: buildJobsFilter({ status: "generated", domain: "example.com" }),
    });
    assert.deepEqual(capturedPipeline[1], {
      $addFields: {
        sortStatusOrder: {
          $switch: {
            branches: Object.entries(STATUS_SORT_ORDER).map(([status, order]) => ({
              case: { $eq: ["$status", status] },
              then: order,
            })),
            default: Object.keys(STATUS_SORT_ORDER).length,
          },
        },
        sortMatchRate: {
          $ifNull: ["$matchRate", -1],
        },
      },
    });
    assert.deepEqual(capturedPipeline[2], {
      $sort: { sortStatusOrder: 1, sortMatchRate: -1, updatedAt: -1 },
    });
    assert.deepEqual(capturedPipeline[3], {
      $facet: {
        items: [
          { $skip: 10 },
          { $limit: 10 },
          {
            $project: {
              sortStatusOrder: 0,
              sortMatchRate: 0,
            },
          },
        ],
        total: [{ $count: "count" }],
      },
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

test("updateJobById not found returns 404 and does not emit event", async () => {
  const { eventBus, JOB_STATUS_CHANGED } = require("../events/jobEvents");
  const originalFindById = JobPage.findById;
  JobPage.findById = () => ({ lean: async () => null });

  let emitted = false;
  const listener = () => { emitted = true; };
  eventBus.on(JOB_STATUS_CHANGED, listener);

  try {
    const result = await updateJobById("507f1f77bcf86cd799439011", { status: "cancelled" });
    assert.equal(result.code, 404);
    assert.equal(emitted, false);
  } finally {
    JobPage.findById = originalFindById;
    eventBus.off(JOB_STATUS_CHANGED, listener);
  }
});

test("updateJobById updates and returns job, emits StatusChangedEvent", async () => {
  const { eventBus, JOB_STATUS_CHANGED } = require("../events/jobEvents");
  const originalFindById = JobPage.findById;
  const originalFindByIdAndUpdate = JobPage.findByIdAndUpdate;
  const id = "507f1f77bcf86cd799439011";

  JobPage.findById = () => ({ lean: async () => ({ _id: id, status: "saved" }) });
  JobPage.findByIdAndUpdate = (qid, update, options) => ({
    lean: async () => ({ _id: qid, status: update.status, options }),
  });

  let emittedEvent = null;
  const listener = (payload) => { emittedEvent = payload; };
  eventBus.on(JOB_STATUS_CHANGED, listener);

  try {
    const result = await updateJobById(id, { status: "applied" });
    assert.ok(!result.error);
    assert.equal(result.job.status, "applied");
    assert.equal(result.job.options.returnDocument, "after");
    assert.equal(result.job.options.runValidators, true);
    assert.deepEqual(emittedEvent, { jobId: id, fromStatus: "saved", toStatus: "applied" });
  } finally {
    JobPage.findById = originalFindById;
    JobPage.findByIdAndUpdate = originalFindByIdAndUpdate;
    eventBus.off(JOB_STATUS_CHANGED, listener);
  }
});
