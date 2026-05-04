const { EventEmitter } = require('events');

const eventBus = new EventEmitter();
const JOB_STATUS_CHANGED = 'job.statusChanged';
const JOB_UPDATED = 'job_updated';

module.exports = { eventBus, JOB_STATUS_CHANGED, JOB_UPDATED };
