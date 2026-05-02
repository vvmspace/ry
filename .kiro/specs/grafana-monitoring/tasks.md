# Implementation Plan: Grafana Monitoring

## Overview

Incremental implementation: EventBus first, then metrics, then SSE, then routing refactor, then Docker/config, then frontend. Each step wires into the previous so nothing is left orphaned.

## Tasks

- [x] 1. Add prom-client dependency and EventBus module
  - Add `prom-client` as a production dependency in `package.json`
  - Add `fast-check` as a dev dependency in `package.json`
  - Create `src/events/jobEvents.js` exporting a singleton `EventEmitter` as `eventBus` and the constant `JOB_STATUS_CHANGED = 'job.statusChanged'`
  - _Requirements: 7.1, 2.1, 2.2_

  - [ ]* 1.1 Write unit test for EventBus singleton and constant
    - Assert `require()` twice returns the same reference
    - Assert `JOB_STATUS_CHANGED === 'job.statusChanged'`
    - _Requirements: 2.1, 2.2_

- [x] 2. Refactor `updateJobById` to emit StatusChangedEvent
  - In `src/api/jobsHandler.js`, split the single `findByIdAndUpdate` into: `findById` (capture `fromStatus`), then `findByIdAndUpdate`, then `eventBus.emit(JOB_STATUS_CHANGED, { jobId, fromStatus, toStatus })`
  - If job not found after `findById`, return `{ error: 'not found', code: 404 }` without emitting
  - Import only `eventBus` and `JOB_STATUS_CHANGED` from `src/events/jobEvents.js` — no prom-client import
  - _Requirements: 2.3, 2.4, 2.5_

  - [ ]* 2.1 Write property test for updateJobById event emission
    - **Property 3: updateJobById emits correct event payload**
    - **Validates: Requirements 2.3, 2.4**
    - For any `(fromStatus, toStatus)` pair: create job with `fromStatus`, call `updateJobById`, assert exactly one event emitted with correct `{ jobId, fromStatus, toStatus }`
    - For non-existent job: assert no event emitted

  - [ ]* 2.2 Write unit tests for updateJobById error paths
    - Assert no event emitted when job not found
    - Assert no event emitted when status is invalid
    - _Requirements: 2.4, 2.5_

- [x] 3. Implement Metrics Module (`src/metrics/jobMetrics.js`)
  - Initialize `prom-client` with `collectDefaultMetrics()`
  - Register `job_status_transitions_total` Counter with labels `status`, `from_status`
  - Register `job_status_current_total` Gauge with label `status` using an async `collect()` that runs `JobPage.aggregate` on every scrape
  - Subscribe to `JOB_STATUS_CHANGED` on EventBus in `initMetrics()`, incrementing the counter on each event
  - Export `{ initMetrics, register }`
  - _Requirements: 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 7.2, 7.3_

  - [ ]* 3.1 Write property test for counter reflecting emitted events
    - **Property 1: Status transition counter reflects all emitted events**
    - **Validates: Requirements 1.3, 3.2**
    - For any array of `(fromStatus, toStatus)` pairs: reset registry, emit all pairs, assert counter values match pair frequencies

  - [ ]* 3.2 Write property test for gauge reflecting MongoDB counts
    - **Property 2: Gauge reflects actual MongoDB counts**
    - **Validates: Requirements 1.4**
    - For any set of seeded jobs: call `register.metrics()`, parse gauge values, assert they match actual per-status counts

- [x] 4. Implement SSE Handler (`src/api/statsHandler.js`)
  - Create `getCounts()` helper that aggregates MongoDB counts for all 7 statuses, defaulting missing ones to `0`
  - Implement `handleStatsStream(req, res)`: set SSE headers, add `res` to `clients` Set, send initial snapshot, register per-connection EventBus listener that re-queries and pushes to all clients, clean up on `req.on('close')`
  - Export `{ handleStatsStream }`
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 4.1 Write property test for SSE initial snapshot
    - **Property 4: SSE initial snapshot matches MongoDB state**
    - **Validates: Requirements 8.2, 8.7**
    - For any set of seeded jobs: connect mock SSE client, parse first `data:` message, assert all 7 statuses present with correct counts (missing = 0)

  - [ ]* 4.2 Write property test for SSE push to all clients
    - **Property 5: SSE push reaches all connected clients**
    - **Validates: Requirements 8.4**
    - For N clients (1–10): emit `job.statusChanged`, assert all N received a `data:` message

  - [ ]* 4.3 Write property test for client disconnect cleanup
    - **Property 6: Client disconnect cleans up connection and listener**
    - **Validates: Requirements 8.6**
    - For N clients, disconnect one: assert `clients.size === N-1` and EventBus listener removed

- [x] 5. Checkpoint — core backend wired
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Refactor API routing — shared utilities and router
  - Create `src/api/utils.js` with `parseQuery` and `readBody` extracted from `server.js`
  - Create `src/api/router.js` exporting `handleRequest(req, res)`: applies CORS, handles OPTIONS preflight, iterates registered route arrays in order, delegates to first match, returns 404 if none match
  - Import and spread routes from `routes/jobs`, `routes/stats`, `routes/metrics`, `routes/profiles`, `routes/static` in that order
  - _Requirements: (structural refactor, enables Req 1.1, 8.1)_

- [x] 7. Implement route files
  - Create `src/api/routes/jobs.js`: `GET /api/v1/jobs`, `PATCH /api/v1/jobs/:id` (named-group regex), `GET /api/v1/jobs/:id/cv`; add 301 redirect handlers for legacy `/api/jobs/:id` and `/api/jobs/:id/cv` paths
  - Create `src/api/routes/stats.js`: `GET /api/v1/stats/stream` → `handleStatsStream`
  - Create `src/api/routes/metrics.js`: `GET /metrics` → reads `register.metrics()`, responds with correct `Content-Type`
  - Create `src/api/routes/profiles.js`: `GET /api/v1/copy` → returns `LINKEDIN_PROFILE`/`GITHUB_PROFILE` from env
  - Create `src/api/routes/static.js`: catch-all `*` for static file serving (move logic from `server.js`)
  - _Requirements: 1.1, 1.2, 8.1_

  - [ ]* 7.1 Write unit tests for metrics and SSE routes
    - Assert `GET /metrics` returns HTTP 200 with `Content-Type: text/plain; version=0.0.4`
    - Assert `GET /api/v1/stats/stream` returns `Content-Type: text/event-stream`
    - _Requirements: 1.1, 1.2, 8.1_

- [x] 8. Refactor `server.js` to bootstrap-only
  - Replace all route logic in `src/api/server.js` with `require('./router').handleRequest`
  - Call `initMetrics()` before `server.listen()`
  - Keep only: `connectMongo()`, `initMetrics()`, `http.createServer(handleRequest)`, `server.listen()`
  - _Requirements: 7.2, 3.1_

- [x] 9. Checkpoint — full backend wired
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Add Docker Compose and monitoring config files
  - Create `docker-compose.yml` with `prometheus` service (`prom/prometheus`, `network_mode: host`, mounts `./monitoring/prometheus.yml`) and `grafana` service (`grafana/grafana`, port `3000:3000`, mounts `./monitoring/grafana/provisioning`, env `GF_SECURITY_ADMIN_PASSWORD=admin`)
  - Create `monitoring/prometheus.yml` with `scrape_interval: 15s` and job `remoteyeah_api` targeting `localhost:4040`
  - Create `monitoring/grafana/provisioning/datasources/ds.yml` pointing to `http://prometheus:9090` as default datasource
  - Create `monitoring/grafana/provisioning/dashboards/provider.yml` with file provider pointing to `/etc/grafana/provisioning/dashboards`
  - Create `monitoring/grafana/provisioning/dashboards/jobs.json` with two panels: time series for `rate(job_status_transitions_total[5m])` by `status`, and stat panel for `job_status_current_total` by `status`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 10.1 Write unit tests for Docker and config files
    - Assert `docker-compose.yml` defines both `prometheus` and `grafana` services
    - Assert `monitoring/prometheus.yml` targets `localhost:4040`
    - _Requirements: 4.1, 4.2, 5.1_

- [x] 11. Add Stats Widget to `frontend/pages/index.vue`
  - Add `liveStats` ref and `statsSource` EventSource variable to script setup
  - In `onMounted`: open `EventSource` to `${base}/api/v1/stats/stream`, assign `onmessage` handler to merge parsed JSON into `liveStats`, assign `onerror` to close and null the source
  - In `onUnmounted`: close `statsSource` if open
  - Add `<section class="stats-widget">` above `.status-filters` section, rendering a badge button per status in `STATUSES` showing `liveStats[status] ?? statusCounts[status]`, wired to `toggleStatusFilter`
  - Update `updateStatus` to use `/api/v1/jobs/${id}` (replacing `/api/jobs/${id}`)
  - Update `getCvDownloadUrl` to use `/api/v1/jobs/${job._id}/cv` (replacing `/api/jobs/${job._id}/cv`)
  - Add minimal CSS for `.stats-widget` and `.stats-badge` consistent with existing status color scheme
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 11.1 Write property test for stats widget SSE updates
    - **Property 7: Stats widget updates displayed counts on SSE message**
    - **Validates: Requirements 9.3**
    - For any valid status count payload: mount component with mock EventSource, fire `onmessage`, assert `liveStats.value` matches payload for all keys

  - [ ]* 11.2 Write property test for stats widget click behavior
    - **Property 8: Stats widget click delegates to toggleStatusFilter**
    - **Validates: Requirements 9.5**
    - For any `(clicked, currentFilter)` pair: simulate badge click, assert `statusFilter` equals clicked status if not already active, or `''` if it was active

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (Properties 1–8 from design.md)
- Unit tests validate specific examples and edge cases
- The 301 redirects in `routes/jobs.js` provide backward compatibility until the frontend URL migration in task 11 is complete — remove them after task 11 is deployed
