'use strict';

const fs = require('fs');
const path = require('path');

const STATE_PATH = path.resolve(process.cwd(), 'state.json');

function readState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function getLastTs(state, type, key) {
  const val = state?.last?.[type]?.[key];
  if (!val) return 0;
  const ms = new Date(val).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

function setLastTs(type, key) {
  const state = readState();
  if (!state.last) state.last = {};
  if (!state.last[type]) state.last[type] = {};
  state.last[type][key] = new Date().toISOString();
  writeState(state);
}

/**
 * Check interval guard.
 * @param {string} successEnvKey  - env var name for success interval
 * @param {string} errorEnvKey    - env var name for error interval
 * @param {string} stateKey       - key in state.last.success / state.last.error
 * @returns {boolean} true if should exit (too soon)
 */
function shouldSkip(successEnvKey, errorEnvKey, stateKey) {
  const state = readState();
  const nowS = Math.floor(Date.now() / 1000);

  const successInterval = parseInt(process.env[successEnvKey], 10);
  if (Number.isFinite(successInterval) && successInterval > 0) {
    const lastSuccess = getLastTs(state, 'success', stateKey);
    if (lastSuccess && (nowS - successInterval) < lastSuccess) {
      console.log(`[state] Skipping: last success ${stateKey} was ${nowS - lastSuccess}s ago, interval=${successInterval}s`);
      return true;
    }
  }

  const errorInterval = parseInt(process.env[errorEnvKey], 10);
  if (Number.isFinite(errorInterval) && errorInterval > 0) {
    const lastError = getLastTs(state, 'error', stateKey);
    if (lastError && (nowS - errorInterval) < lastError) {
      console.log(`[state] Skipping: last error ${stateKey} was ${nowS - lastError}s ago, interval=${errorInterval}s`);
      return true;
    }
  }

  return false;
}

module.exports = { readState, writeState, setLastTs, shouldSkip };
