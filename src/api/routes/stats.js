'use strict';

const { handleStatsStream } = require('../statsHandler');

module.exports = [
  { method: 'GET', pattern: '/api/v1/stats/stream', handler: handleStatsStream },
];
