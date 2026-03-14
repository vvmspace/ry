const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('node:util'); // not available, use manual parse

const ROOT = path.resolve(__dirname, '../../');

test('docker-compose.yml exists', () => {
  const filePath = path.join(ROOT, 'docker-compose.yml');
  assert.ok(fs.existsSync(filePath), 'docker-compose.yml should exist');
});

test('docker-compose.yml defines prometheus service', () => {
  const filePath = path.join(ROOT, 'docker-compose.yml');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('prometheus:'), 'should define prometheus service');
  assert.ok(content.includes('prom/prometheus'), 'should use prom/prometheus image');
});

test('docker-compose.yml defines grafana service', () => {
  const filePath = path.join(ROOT, 'docker-compose.yml');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('grafana:'), 'should define grafana service');
  assert.ok(content.includes('grafana/grafana'), 'should use grafana/grafana image');
});

test('docker-compose.yml grafana exposes port 3000', () => {
  const filePath = path.join(ROOT, 'docker-compose.yml');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('3000:3000'), 'grafana should expose port 3000');
});

test('monitoring/prometheus.yml exists', () => {
  const filePath = path.join(ROOT, 'monitoring/prometheus.yml');
  assert.ok(fs.existsSync(filePath), 'monitoring/prometheus.yml should exist');
});

test('monitoring/prometheus.yml targets host.docker.internal:4040', () => {
  const filePath = path.join(ROOT, 'monitoring/prometheus.yml');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('host.docker.internal:4040'), 'should target host.docker.internal:4040');
});

test('monitoring/prometheus.yml has scrape_interval 15s', () => {
  const filePath = path.join(ROOT, 'monitoring/prometheus.yml');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('scrape_interval: 15s'), 'should have 15s scrape interval');
});

test('monitoring/grafana/provisioning/datasources/ds.yml exists and points to prometheus:9090', () => {
  const filePath = path.join(ROOT, 'monitoring/grafana/provisioning/datasources/ds.yml');
  assert.ok(fs.existsSync(filePath), 'ds.yml should exist');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('http://prometheus:9090'), 'datasource should point to prometheus:9090');
  assert.ok(content.includes('isDefault: true'), 'datasource should be default');
});

test('monitoring/grafana/provisioning/dashboards/provider.yml exists', () => {
  const filePath = path.join(ROOT, 'monitoring/grafana/provisioning/dashboards/provider.yml');
  assert.ok(fs.existsSync(filePath), 'provider.yml should exist');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('/etc/grafana/provisioning/dashboards'), 'should point to correct path');
});

test('monitoring/grafana/provisioning/dashboards/jobs.json is valid JSON with correct uid and title', () => {
  const filePath = path.join(ROOT, 'monitoring/grafana/provisioning/dashboards/jobs.json');
  assert.ok(fs.existsSync(filePath), 'jobs.json should exist');
  const content = fs.readFileSync(filePath, 'utf8');
  const dashboard = JSON.parse(content);
  assert.equal(dashboard.uid, 'remoteyeah-jobs');
  assert.equal(dashboard.title, 'RemoteYeah Jobs');
  assert.equal(dashboard.schemaVersion, 38);
  assert.equal(dashboard.refresh, '15s');
});

test('jobs.json has two panels with correct queries', () => {
  const filePath = path.join(ROOT, 'monitoring/grafana/provisioning/dashboards/jobs.json');
  const dashboard = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(dashboard.panels.length, 2);

  const timeseriesPanel = dashboard.panels.find(p => p.type === 'timeseries');
  assert.ok(timeseriesPanel, 'should have a timeseries panel');
  assert.equal(timeseriesPanel.title, 'Status Transitions Rate');
  assert.ok(timeseriesPanel.targets[0].expr.includes('rate(job_status_transitions_total'), 'timeseries should query transitions rate');

  const statPanel = dashboard.panels.find(p => p.type === 'stat');
  assert.ok(statPanel, 'should have a stat panel');
  assert.equal(statPanel.title, 'Current Jobs by Status');
  assert.ok(statPanel.targets[0].expr.includes('job_status_current_total'), 'stat panel should query current totals');
});
