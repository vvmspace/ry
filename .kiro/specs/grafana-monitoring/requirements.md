# Requirements Document

## Introduction

Add Grafana monitoring to the RemoteYeah job parser app, deployed via Docker Compose alongside the existing Node.js/PM2 stack. When a job's status changes, the system emits a domain event via an internal EventBus. The Prometheus metrics module subscribes to that event and updates counters. Grafana visualizes job counts by status over time via pre-built dashboards.

The stack uses:
- **EventBus** (`src/events/jobEvents.js`) as the internal decoupling layer between domain logic and observability
- **Prometheus** to scrape a `/metrics` endpoint exposed by the Node.js API
- **Grafana** to display dashboards backed by Prometheus data
- Both run in Docker containers, connecting to the host network where the Node.js app runs

## Glossary

- **API_Server**: The Node.js HTTP server in `src/api/server.js`
- **EventBus**: A singleton Node.js `EventEmitter` instance exported from `src/events/jobEvents.js`, used to decouple domain logic from observability concerns
- **StatusChangedEvent**: A domain event emitted on the EventBus with the event name `job.statusChanged`, carrying `{ jobId, fromStatus, toStatus }` payload
- **Metrics_Module**: The Prometheus metrics module in `src/metrics/jobMetrics.js` that subscribes to the EventBus and updates counters
- **Metrics_Endpoint**: The `GET /metrics` route exposed by the API_Server
- **Prometheus**: Time-series metrics collection service running in Docker
- **Grafana**: Dashboard visualization service running in Docker
- **Job**: A MongoDB document in the `JobPage` collection with a `status` field
- **Docker_Compose**: The `docker-compose.yml` file that defines Prometheus and Grafana services
- **Dashboard**: A pre-provisioned Grafana dashboard JSON loaded automatically on startup
- **SSE_Handler**: The server-side handler for `GET /api/v1/stats/stream` that manages active `EventSource` client connections and pushes status count updates
- **Stats_Widget**: The frontend Vue component on the `/` page that connects to the SSE endpoint and displays real-time job counts per status

## Requirements

### Requirement 1: Metrics Endpoint

**User Story:** As a developer, I want the API server to expose a Prometheus-compatible metrics endpoint, so that Prometheus can scrape job status data.

#### Acceptance Criteria

1. THE API_Server SHALL expose a `GET /metrics` route that returns metrics in Prometheus text exposition format.
2. WHEN the `/metrics` endpoint is requested, THE Metrics_Endpoint SHALL respond with HTTP 200 and `Content-Type: text/plain; version=0.0.4`.
3. THE Metrics_Endpoint SHALL include a counter metric named `job_status_transitions_total` with labels `status` (target status) and `from_status` (previous status).
4. THE Metrics_Endpoint SHALL include a gauge metric named `job_status_current_total` with label `status`, reflecting the current count of jobs per status queried from MongoDB.

### Requirement 2: EventBus Module

**User Story:** As a developer, I want a dedicated internal EventBus module, so that domain logic in handlers is decoupled from observability and any future subscribers (logging, notifications, etc.) can be added without modifying handler code.

#### Acceptance Criteria

1. THE EventBus SHALL be implemented as a singleton Node.js `EventEmitter` exported from `src/events/jobEvents.js`.
2. THE EventBus SHALL define and export a constant `JOB_STATUS_CHANGED = 'job.statusChanged'` as the canonical event name.
3. WHEN `updateJobById` in `jobsHandler.js` successfully updates a job status via `PATCH /api/v1/jobs/:id`, THE EventBus SHALL emit a `job.statusChanged` event with a `StatusChangedEvent` payload `{ jobId, fromStatus, toStatus }`.
4. IF the job is not found during a PATCH request, THEN THE EventBus SHALL NOT emit a `job.statusChanged` event.
5. THE `jobsHandler.js` module SHALL NOT directly reference any Prometheus or metrics module — all observability coupling SHALL be handled exclusively via the EventBus.

### Requirement 3: Prometheus Metrics Subscription

**User Story:** As a developer, I want the Prometheus metrics module to subscribe to job status change events, so that counters are updated reactively without coupling the handler to metrics logic.

#### Acceptance Criteria

1. THE Metrics_Module SHALL subscribe to the `job.statusChanged` event on the EventBus at application startup.
2. WHEN a `job.statusChanged` event is received, THE Metrics_Module SHALL increment the `job_status_transitions_total` counter using the `toStatus` as the `status` label and `fromStatus` as the `from_status` label.
3. THE `job_status_transitions_total` counter SHALL persist in-process memory for the lifetime of the API_Server process.
4. THE Metrics_Module SHALL be the only module that imports `prom-client` counters and gauges — no other module SHALL directly manipulate Prometheus metrics.

### Requirement 4: Docker Compose Setup

**User Story:** As a developer, I want Prometheus and Grafana to run in Docker, so that I can start the monitoring stack with a single command without modifying the existing PM2 setup.

#### Acceptance Criteria

1. THE Docker_Compose SHALL define a `prometheus` service using the official `prom/prometheus` image.
2. THE Docker_Compose SHALL define a `grafana` service using the official `grafana/grafana` image.
3. WHEN `docker compose up -d` is run, THE Docker_Compose SHALL start both services without requiring changes to the existing PM2 ecosystem.
4. THE `prometheus` service SHALL use `host` network mode so it can scrape `localhost:PORT/metrics` from the host machine.
5. THE `grafana` service SHALL expose port `3000` on the host.
6. THE Docker_Compose SHALL mount a `./monitoring/prometheus.yml` config file into the Prometheus container.
7. THE Docker_Compose SHALL mount a `./monitoring/grafana/provisioning` directory into the Grafana container for automatic datasource and dashboard provisioning.

### Requirement 5: Prometheus Configuration

**User Story:** As a developer, I want Prometheus pre-configured to scrape the Node.js API, so that no manual setup is needed after `docker compose up`.

#### Acceptance Criteria

1. THE `monitoring/prometheus.yml` file SHALL define a scrape job named `remoteyeah_api` targeting `localhost:4040` (or the value of `PORT` env var).
2. THE Prometheus scrape interval SHALL be 15 seconds.
3. IF the `/metrics` endpoint is unreachable, THEN Prometheus SHALL mark the target as `DOWN` and retry on the next scrape interval without crashing.

### Requirement 6: Grafana Provisioning

**User Story:** As a developer, I want Grafana to load with a pre-built dashboard on first start, so that I can immediately see job status charts without manual configuration.

#### Acceptance Criteria

1. THE `monitoring/grafana/provisioning/datasources` directory SHALL contain a YAML file that configures Prometheus as the default datasource pointing to `http://prometheus:9090`.
2. THE `monitoring/grafana/provisioning/dashboards` directory SHALL contain a YAML provider file and a JSON dashboard file.
3. WHEN Grafana starts, THE Dashboard SHALL be automatically loaded and visible in the Grafana UI without manual import.
4. THE Dashboard SHALL include a panel showing `job_status_transitions_total` rate over time, broken down by `status` label.
5. THE Dashboard SHALL include a panel showing `job_status_current_total` gauge values per status as a stat or bar chart.

### Requirement 7: Dependency Management

**User Story:** As a developer, I want the Prometheus client library added to the Node.js project, so that the metrics endpoint works without manual npm installs.

#### Acceptance Criteria

1. THE `package.json` SHALL include `prom-client` as a production dependency.
2. THE API_Server SHALL initialize the Prometheus default registry on startup.
3. THE API_Server SHALL collect default Node.js process metrics (event loop lag, memory, CPU) via `prom-client` default metrics collection.

### Requirement 8: Real-Time Stats SSE Endpoint

**User Story:** As a developer, I want a server-sent events endpoint that pushes live job status counts, so that connected clients receive updates instantly without polling.

#### Acceptance Criteria

1. THE API_Server SHALL expose a `GET /api/v1/stats/stream` route that responds with `Content-Type: text/event-stream` and keeps the connection open.
2. WHEN a client connects to `/api/v1/stats/stream`, THE API_Server SHALL immediately send an initial snapshot of current job counts per status queried from MongoDB, in the format `data: {"pending":N,"saved":N,"generated":N,"started":N,"applied":N,"cancelled":N,"error":N}`.
3. THE SSE handler SHALL subscribe to the `job.statusChanged` event on the EventBus defined in Requirement 2, using the exported `JOB_STATUS_CHANGED` constant as the event name.
4. WHEN a `job.statusChanged` event is received, THE SSE handler SHALL query MongoDB for current counts per status and push a `data:` message with the updated counts to all currently connected clients.
5. THE SSE handler SHALL NOT duplicate event emission logic — it SHALL only subscribe to the EventBus as a consumer, not emit `job.statusChanged` events itself.
6. WHEN a client disconnects from `/api/v1/stats/stream`, THE API_Server SHALL remove that client from the active connections list and unsubscribe its listener from the EventBus.
7. IF no jobs exist for a given status, THEN THE SSE handler SHALL include that status in the payload with a count of `0`.

### Requirement 9: Real-Time Stats Widget (Frontend)

**User Story:** As a developer, I want a real-time stats bar on the main page showing job counts per status, so that I can see the current distribution at a glance without refreshing the page.

#### Acceptance Criteria

1. THE Stats_Widget SHALL be rendered on the `/` page above the existing status filter chips.
2. THE Stats_Widget SHALL connect to `GET /api/v1/stats/stream` using the browser `EventSource` API on component mount.
3. WHEN a `data:` message is received from the SSE stream, THE Stats_Widget SHALL update the displayed count for each status without a full page reload.
4. THE Stats_Widget SHALL display a count badge for each status value in `STATUSES` (`pending`, `saved`, `generated`, `started`, `applied`, `cancelled`, `error`), styled consistently with the existing status color scheme used in the filter chips.
5. WHEN a user clicks a status count badge in THE Stats_Widget, THE Stats_Widget SHALL set `statusFilter` to that status, reusing the existing `toggleStatusFilter` function.
6. WHEN the component is unmounted, THE Stats_Widget SHALL close the `EventSource` connection to prevent memory leaks.
7. IF the `EventSource` connection fails or is unavailable, THEN THE Stats_Widget SHALL fall back to displaying counts derived from the locally loaded `jobs` array (the existing `statusCounts` computed property).
