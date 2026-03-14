'use strict';

const promClient = require('prom-client');
const { eventBus, JOB_STATUS_CHANGED } = require('../events/jobEvents');
const JobPage = require('../models/jobPage');

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

function initMetrics() {
  promClient.collectDefaultMetrics();
  eventBus.on(JOB_STATUS_CHANGED, ({ fromStatus, toStatus }) => {
    transitionsCounter.inc({ status: toStatus, from_status: fromStatus });
  });
}

module.exports = { initMetrics, register: promClient.register };
