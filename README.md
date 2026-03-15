# RemoteYeah Parser

Scrapes job listings from [remoteyeah.com](https://remoteyeah.com) and generates tailored CVs via AI.

## Stack

Node.js, Mongoose, Puppeteer, Nuxt.js (frontend), Prometheus + Grafana (monitoring)

## Quick start

```bash
npm run init        # copies .env.example -> .env
# fill in .env
npm install
cd frontend && npm install && cd ..
npm run start       # builds frontend and starts API
```

## Environment variables

| Variable | Description |
|---|---|
| `MONGODB_CONNECTION_STRING` | MongoDB URI |
| `MONGODB_DATABASE` | Database name (default: `remoteyeah`) |
| `REMOTEYEAH_SEARCH_URLS` | Comma-separated list URLs to scrape |
| `STOP_WORDS` | Comma-separated words to filter out job URLs |
| `LINKEDIN_PROFILE` | LinkedIn URL for quick copy |
| `GITHUB_PROFILE` | GitHub URL for quick copy |
| `PORT` | API + frontend port (default: `4040`) |
| `USER_DIR` | Puppeteer user data directory (default: `userdir`) |
| `CV_TEMPLATE` | CV template name (default: `dark_calendly`) |
| `CV_MODEL` | AI model (default: `gemini-3.1-pro-preview`) |

### Worker interval guards (optional, in seconds)

| Variable | Description |
|---|---|
| `PENDING_SUCCESS_INTERVAL` | Cooldown after successful list parse |
| `PENDING_ERROR_INTERVAL` | Cooldown after failed list parse |
| `SAVED_SUCCESS_INTERVAL` | Cooldown after successful job page parse |
| `SAVED_ERROR_INTERVAL` | Cooldown after failed job page parse |
| `GENERATED_SUCCESS_INTERVAL` | Cooldown after successful CV generation |
| `GENERATED_ERROR_INTERVAL` | Cooldown after failed CV generation |

## Workers

```bash
npm run jobs:list    # scrape job list -> status: pending
npm run jobs:parse   # parse one job page -> status: saved
npm run cv:generate  # generate CV for one job -> status: generated
```

### Pipeline

1. `jobs:list` — finds job URLs, saves them to DB with status `pending`
2. `jobs:parse` — takes one `pending` job, parses the page, clicks Apply to extract `applicationUrl`, saves with status `saved`
3. `cv:generate` — takes one `saved` job, generates a CV via API, saves with status `generated`

### state.json

Root-level file (in `.gitignore`). Stores last success/error timestamps per worker. Used for interval guards — if a worker runs too soon it exits via `process.exit()`.

```json
{
  "last": {
    "success": { "pending": "2026-01-01T00:00:00.000Z", "saved": "...", "generated": "..." },
    "error":   { "pending": "...", "saved": "...", "generated": "..." }
  }
}
```

### priority.json

Controls which `saved` job gets picked first for CV generation. The worker selects the job with the most filter matches (via MongoDB aggregate), then by `updatedAt` desc.

```json
{
  "generate": {
    "domain": ["ashbyhq.com"],
    "description": ["nestjs", "node.js"]
  }
}
```

Each string is an `includes` match (case-insensitive), not an exact equality check.

## API

`GET /api/v1/jobs` — list jobs

| Param | Description |
|---|---|
| `status` | filter by status |
| `query` | title or description contains |
| `exclude` | title and description do not contain |
| `domain` | domain contains |

`PATCH /api/v1/jobs/:id` — update status `{ status: "..." }`

Statuses: `pending` → `saved` → `generated` → `started` → `applied` / `cancelled` / `expired`

## PM2 (production)

```bash
npm run start:all    # start all processes via pm2
npm run stop:all
npm run restart:all
```

## Deploy

```bash
npm run deploy
```

Configure `USER_HOST` and `REMOTE_PATH` in `.env`.

## Monitoring

Prometheus + Grafana via docker-compose:

```bash
docker-compose up -d
```

Metrics available at `/metrics`. Grafana dashboard includes:
- status transition rates
- current job counts by status
- match rate bucket breakdown for generated/applied/cancelled/expired statuses
