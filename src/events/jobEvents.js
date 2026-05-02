const { EventEmitter } = require('events');

const eventBus = new EventEmitter();
const JOB_STATUS_CHANGED = 'job.statusChanged';

module.exports = { eventBus, JOB_STATUS_CHANGED };
