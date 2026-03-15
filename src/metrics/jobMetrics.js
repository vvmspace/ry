'use strict';

const promClient = require('prom-client');
const { eventBus, JOB_STATUS_CHANGED } = require('../events/jobEvents');
const JobPage = require('../models/jobPage');

const RATE_STATUSES = ['generated', 'applied', 'cancelled', 'expired'];
const RATE_BUCKETS = [
  { label: '95+',   min: 95,  max: Infinity },
  { label: '85-95', min: 85,  max: 95 },
  { label: '75-85', min: 75,  max: 85 },
  { label: '65-75', min: 65,  max: 75 },
  { label: '50-65', min: 50,  max: 65 },
  { label: '0-50',  min: 0,   max: 50 },
];

// Registered once at module load — never re-registered
const transitionsCounter = new promClient.Counter({
  name: 'job_status_transitions_total',
  help: 'Total number of job status transitions',
  labelNames: ['status', 'from_status'],
});

new promClient.Gauge({
  name: 'job_status_current_total',
  help: 'Current number of jobs per status',
  labelNames: ['status'],
  async collect() {
    const counts = await JobPage.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    this.reset();
    for (const { _id, count } of counts) this.set({ status: _id }, count);
  },
});

new promClient.Gauge({
  name: 'job_match_rate_bucket',
  help: 'Number of jobs per status and match_rate bucket',
  labelNames: ['status', 'bucket'],
  async collect() {
    const rows = await JobPage.aggregate([
      { $match: { status: { $in: RATE_STATUSES }, matchRate: { $type: 'number' } } },
      { $group: { _id: '$status', rates: { $push: '$matchRate' } } },
    ]);
    this.reset();
    for (const { _id: status, rates } of rows) {
      for (const { label, min, max } of RATE_BUCKETS) {
        const count = rates.filter(r => r >= min && r < max).length;
        this.set({ status, bucket: label }, count);
      }
    }
  },
});

function initMetrics() {
  promClient.collectDefaultMetrics();
  eventBus.on(JOB_STATUS_CHANGED, ({ fromStatus, toStatus }) => {
    transitionsCounter.inc({ status: toStatus, from_status: fromStatus });
  });
}

module.exports = { initMetrics, register: promClient.register };
