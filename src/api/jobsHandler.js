const JobPage = require("../models/jobPage");
const { eventBus, JOB_STATUS_CHANGED } = require("../events/jobEvents");

const STATUS_SORT_ORDER = {
  started: 0,
  generated: 1,
  error: 2,
  saved: 3,
  pending: 4,
  applied: 5,
  cancelled: 6,
  expired: 7,
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildJobsFilter(queryParams) {
  const conditions = [];

  const status = queryParams.status?.trim();
  if (status) {
    conditions.push({ status });
  }

  const query = queryParams.query?.trim();
  if (query) {
    const re = new RegExp(escapeRegex(query), "i");
    conditions.push({ $or: [{ title: re }, { description: re }] });
  }

  const exclude = queryParams.exclude?.trim();
  if (exclude) {
    const re = new RegExp(escapeRegex(exclude), "i");
    conditions.push({ title: { $not: re } });
    conditions.push({ description: { $not: re } });
  }

  const domain = queryParams.domain?.trim();
  if (domain) {
    conditions.push({ domain: new RegExp(escapeRegex(domain), "i") });
  }

  return conditions.length ? { $and: conditions } : {};
}

function parsePositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

async function listJobs(queryParams) {
  const filter = buildJobsFilter(queryParams);
  const page = parsePositiveInt(queryParams.page, 1, { min: 1, max: 100000 });
  const limit = parsePositiveInt(queryParams.limit, 100, { min: 1, max: 100 });
  const skip = (page - 1) * limit;
  const [result] = await JobPage.aggregate([
    { $match: filter },
    {
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
    },
    { $sort: { sortStatusOrder: 1, sortMatchRate: -1, updatedAt: -1 } },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              sortStatusOrder: 0,
              sortMatchRate: 0,
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
    {
      $project: {
        items: 1,
        total: { $ifNull: [{ $arrayElemAt: ["$total.count", 0] }, 0] },
      },
    },
  ]);
  const total = result?.total || 0;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return {
    items: result?.items || [],
    page,
    limit,
    total,
    totalPages,
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

const ALLOWED_STATUSES = ["pending", "saved", "generated", "started", "applied", "cancelled", "error", "expired"];

async function updateJobById(id, body) {
  const status = body?.status;
  if (!status || typeof status !== "string" || !ALLOWED_STATUSES.includes(status)) {
    return { error: "invalid status", code: 400 };
  }
  const existing = await JobPage.findById(id).lean();
  if (!existing) return { error: "not found", code: 404 };
  const fromStatus = existing.status;
  const job = await JobPage.findByIdAndUpdate(
    id,
    { status },
    { returnDocument: "after", runValidators: true }
  ).lean();
  eventBus.emit(JOB_STATUS_CHANGED, { jobId: id, fromStatus, toStatus: status });
  return { job };
}

async function getJobById(id) {
  return JobPage.findById(id).lean();
}

module.exports = {
  escapeRegex,
  buildJobsFilter,
  listJobs,
  updateJobById,
  getJobById,
  parsePositiveInt,
  ALLOWED_STATUSES,
  STATUS_SORT_ORDER,
};
