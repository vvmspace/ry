const mongoose = require("mongoose");

const jobPageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "saved", "generated", "applied", "cancelled", "error"],
      required: true,
      default: "pending",
      index: true,
    },
    title: String,
    companyName: String,
    salary: String,
    description: String,
    applicationUrl: String,
    domain: String,
    cvUrl: String,
    greetingMessage: String,
    matchRate: Number,
    email: String,
    topTechAndSkills: String,
    whyAnswer: String,
  },
  {
    timestamps: true,
  }
);

const JobPage = mongoose.models.JobPage || mongoose.model("JobPage", jobPageSchema);

module.exports = JobPage;
