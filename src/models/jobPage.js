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
      enum: ["pending", "saved", "generated", "started", "applied", "cancelled", "error", "expired"],
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
    /** Optional:
     * Job title - sourceJobTitle
      Job type - sourceJobType (Full-time/...)
      Experience level - sourceExperienceLevel (Internship/Entry/Senior)
      Degree requirement - degreeRequired (boolean)
      Skills - skills ['Machine Learning', 'TypeScript']
      Location requirements - locations ['Serbia', 'Armenia']
      Benefits - benefits ['Medical benefits', 'Relocation', ...]
     */
    
    sourceJobTitle: String,
    sourceJobType: String,
    sourceExperienceLevel: String,
    degreeRequired: Boolean,
    skills: [String],
    locations: [String],
    benefits: [String],
    additional_questions: [String],
    manual: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

const JobPage = mongoose.models.JobPage || mongoose.model("JobPage", jobPageSchema);

module.exports = JobPage;
