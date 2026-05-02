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
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[state] Failed to write state.json:', err);
  }
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
  console.log(`[state] ${type}.${key} = ${state.last[type][key]}`);
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

function allocateBrowser() {
  const state = readState();
  const now = new Date();

  if (!state.browser) {
    state.browser = { active: false, lastUsage: now.toISOString() };
  }

  if (state.browser.active) {
    const lastUsageDate = new Date(state.browser.lastUsage);
    const minute = 1 * 60 * 1000;

    if (now.getTime() - lastUsageDate.getTime() < minute) {
      console.log(`[state] Browser is active (last used < 1 min ago). Skipping.`);
      return false;
    }
    console.log(`[state] Browser active lock expired. Reclaiming.`);
  }

  state.browser.active = true;
  state.browser.lastUsage = now.toISOString();
  writeState(state);
  return true;
}

function releaseBrowser() {
  const state = readState();
  if (!state.browser) {
    state.browser = {};
  }
  state.browser.active = false;
  state.browser.lastUsage = new Date().toISOString();
  writeState(state);
}

module.exports = { readState, writeState, setLastTs, shouldSkip, allocateBrowser, releaseBrowser };
