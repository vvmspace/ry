'use strict';

const JobPage = require('../models/jobPage');
const { eventBus, JOB_STATUS_CHANGED } = require('../events/jobEvents');

const STATUSES = ['pending', 'saved', 'generated', 'started', 'applied', 'cancelled', 'error'];

const clients = new Set();

async function getCounts() {
  const rows = await JobPage.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const map = Object.fromEntries(rows.map(r => [r._id, r.count]));
  return Object.fromEntries(STATUSES.map(s => [s, map[s] ?? 0]));
}

async function handleStatsStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  clients.add(res);

  try {
    res.write('data: ' + JSON.stringify(await getCounts()) + '\n\n');
  } catch (err) {
    console.error('[statsHandler] initial snapshot error:', err);
  }

  const listener = async () => {
    let counts;
    try {
      counts = await getCounts();
    } catch (err) {
      console.error('[statsHandler] getCounts error:', err);
      return;
    }
    const payload = 'data: ' + JSON.stringify(counts) + '\n\n';
    for (const client of clients) {
      try {
        client.write(payload);
      } catch (err) {
        console.error('[statsHandler] client write error:', err);
      }
    }
  };

  eventBus.on(JOB_STATUS_CHANGED, listener);

  req.on('close', () => {
    clients.delete(res);
    eventBus.off(JOB_STATUS_CHANGED, listener);
  });
}

module.exports = { handleStatsStream };
