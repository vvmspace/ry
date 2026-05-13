const JobPage = require("../models/jobPage");
const { eventBus, JOB_STATUS_CHANGED, JOB_UPDATED } = require("../events/jobEvents");

const STATUS_SORT_ORDER = {
  interview: 0,
  screening: 1,
  started: 2,
  generated: 3,
  error: 4,
  saved: 5,
  pending: 6,
  applied: 7,
  cancelled: 8,
  expired: 9,
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
  const limit = parsePositiveInt(queryParams.limit, 100, { min: 1, max: 1000 });
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
  ]).allowDiskUse(true);
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

const ALLOWED_STATUSES = ["pending", "saved", "generated", "started", "applied", "screening", "interview", "cancelled", "error", "expired"];

async function updateJobById(id, body) {
  const updateData = {};
  if (body && typeof body === 'object') {
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string' && value !== '') {
        updateData[key] = value;
      }
    }
  }

  if (Object.keys(updateData).length === 0) {
    return { error: "no valid fields to update", code: 400 };
  }

  if (updateData.status && !ALLOWED_STATUSES.includes(updateData.status)) {
    return { error: "invalid status", code: 400 };
  }

  const existing = await JobPage.findById(id).lean();
  if (!existing) return { error: "not found", code: 404 };
  const fromStatus = existing.status;

  const job = await JobPage.findByIdAndUpdate(
    id,
    updateData,
    { returnDocument: "after", runValidators: true }
  ).lean();

  if (updateData.status && fromStatus !== updateData.status) {
    eventBus.emit(JOB_STATUS_CHANGED, { jobId: id, fromStatus, toStatus: updateData.status });
  }

  eventBus.emit(JOB_UPDATED, { id, ...updateData });

  return { job };
}

async function createJob(body) {
  const jobData = {
    manual: true,
  };
  
  if (body && typeof body === 'object') {
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== null && value !== '') {
        // Special handling for vacancyText -> description mapping if needed, 
        // but let's stick to the model names. 
        // The prompt says vacancyText, but the model has description.
        if (key === 'vacancyText') {
          jobData.description = value;
        } else {
          jobData[key] = value;
        }
      }
    }
  }

  if (!jobData.url) {
    // If url is not provided, use applicationUrl if it looks like a full URL, 
    // or generate a unique one.
    jobData.url = jobData.applicationUrl || `manual-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  if (!jobData.status) {
    jobData.status = 'saved';
  }

  const job = new JobPage(jobData);
  await job.save();
  return { job: job.toObject() };
}

async function getJobById(id) {
  return JobPage.findById(id).lean();
}

module.exports = {
  escapeRegex,
  buildJobsFilter,
  listJobs,
  updateJobById,
  createJob,
  getJobById,
  parsePositiveInt,
  ALLOWED_STATUSES,
  STATUS_SORT_ORDER,
};
