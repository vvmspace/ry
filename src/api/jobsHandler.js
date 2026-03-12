const JobPage = require("../models/jobPage");

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

async function listJobs(queryParams) {
  const filter = buildJobsFilter(queryParams);
  return JobPage.aggregate([
    { $match: filter },
    {
      $addFields: {
        sortGeneratedFirst: {
          $cond: [{ $eq: ["$status", "generated"] }, 0, 1],
        },
      },
    },
    { $sort: { sortGeneratedFirst: 1, updatedAt: -1 } },
    {
      $project: {
        sortGeneratedFirst: 0,
      },
    },
  ]);
}

const ALLOWED_STATUSES = ["pending", "saved", "generated", "applied", "cancelled", "error"];

async function updateJobById(id, body) {
  const status = body?.status;
  if (!status || typeof status !== "string" || !ALLOWED_STATUSES.includes(status)) {
    return { error: "invalid status", code: 400 };
  }
  const job = await JobPage.findByIdAndUpdate(
    id,
    { status },
    { returnDocument: "after", runValidators: true }
  ).lean();
  if (!job) return { error: "not found", code: 404 };
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
  ALLOWED_STATUSES,
};
