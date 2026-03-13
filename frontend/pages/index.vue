<script setup lang="ts">
type JobStatus = "pending" | "saved" | "generated" | "applied" | "cancelled" | "error";

type Job = {
  _id: string;
  title?: string;
  companyName?: string;
  salary?: string;
  domain?: string;
  url?: string;
  applicationUrl?: string;
  status: JobStatus;
  cvUrl?: string;
  greetingMessage?: string;
  matchRate?: number | null;
};

const config = useRuntimeConfig();
const apiBase = ref(
  typeof localStorage !== "undefined"
    ? (localStorage.getItem("apiBase") || config.public.apiBase)
    : config.public.apiBase
);

const jobs = ref<Job[]>([]);
const loading = ref(true);
const error = ref("");
const statusFilter = ref<JobStatus | "">("");
const refreshInterval = ref("0");
const domainFilter = ref("");
const companyFilter = ref("");
const titleFilter = ref("");

const INTERVALS: { value: string; label: string; ms: number }[] = [
  { value: "0", label: "Off", ms: 0 },
  { value: "5", label: "5s", ms: 5_000 },
  { value: "10", label: "10s", ms: 10_000 },
  { value: "30", label: "30s", ms: 30_000 },
  { value: "60", label: "1m", ms: 60_000 },
  { value: "300", label: "5m", ms: 300_000 },
  { value: "600", label: "10m", ms: 600_000 },
  { value: "1800", label: "30m", ms: 1_800_000 },
];

const STATUSES: JobStatus[] = ["pending", "saved", "generated", "applied", "cancelled", "error"];

const statusCounts = computed(() => {
  const counts: Record<JobStatus, number> = {
    pending: 0,
    saved: 0,
    generated: 0,
    applied: 0,
    cancelled: 0,
    error: 0,
  };

  for (const job of jobs.value) {
    counts[job.status] += 1;
  }

  return counts;
});

const totalJobs = computed(() => jobs.value.length);

function normalizeFilterValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length >= 3 ? normalized : "";
}

function getTopLevelDomain(value?: string) {
  if (!value) return "";

  let host = value.trim().toLowerCase();
  if (!host) return "";

  if (host.includes("://")) {
    try {
      host = new URL(host).hostname.toLowerCase();
    } catch {
      host = host.replace(/^[a-z]+:\/\//i, "");
    }
  }

  host = host.split("/")[0]?.split(":")[0] || "";
  host = host.replace(/^www\./, "");

  if (!host) return "";
  if (host === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return host;

  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;

  const commonSecondLevelZones = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
  const last = parts.at(-1) || "";
  const secondLast = parts.at(-2) || "";

  if (last.length === 2 && commonSecondLevelZones.has(secondLast) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

const filteredJobs = computed(() => {
  const domainNeedle = normalizeFilterValue(domainFilter.value);
  const companyNeedle = normalizeFilterValue(companyFilter.value);
  const titleNeedle = normalizeFilterValue(titleFilter.value);

  return jobs.value.filter((job) => {
    if (domainNeedle && !getTopLevelDomain(job.domain).includes(domainNeedle)) {
      return false;
    }

    if (companyNeedle && !job.companyName?.toLowerCase().includes(companyNeedle)) {
      return false;
    }

    if (titleNeedle && !job.title?.toLowerCase().includes(titleNeedle)) {
      return false;
    }

    return true;
  });
});

function saveApiBase() {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("apiBase", apiBase.value);
  }
  refreshJobs();
}

function getVacancyUrl(job: Job) {
  return job.applicationUrl || "";
}

function getCvDownloadUrl(job: Job) {
  let base = apiBase.value.replace(/\/$/, "");
  
  // If apiBase is empty, use current origin
  if (!base && typeof window !== "undefined") {
    base = window.location.origin;
  }
  
  return `${base}/api/jobs/${job._id}/cv`;
}

function getCvFileName(job: Job) {
  const safeTitle = (job.title || "cv")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "cv";
  return `${safeTitle}.pdf`;
}

function formatMatchRate(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}%` : "";
}

function getMatchRateClass(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "rate-empty";
  }

  if (value < 50) return "rate-low";
  if (value <= 75) return "rate-mid";
  return "rate-high";
}

function toggleStatusFilter(status: JobStatus) {
  statusFilter.value = statusFilter.value === status ? "" : status;
}

async function fetchJobs() {
  error.value = "";
  const params = new URLSearchParams();
  if (statusFilter.value) params.set("status", statusFilter.value);

  const base = apiBase.value.replace(/\/$/, "");
  const url = `${base}/api/v1/jobs${params.toString() ? `?${params.toString()}` : ""}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    jobs.value = await res.json();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load jobs";
    jobs.value = [];
  } finally {
    loading.value = false;
  }
}

function refreshJobs() {
  loading.value = true;
  void fetchJobs();
}

async function updateStatus(id: string, status: string) {
  try {
    const base = apiBase.value.replace(/\/$/, "");
    const res = await fetch(`${base}/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchJobs();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to update status";
  }
}

async function copyGreetingMessage(job: Job) {
  if (!job.greetingMessage) return;

  try {
    // Check if clipboard API is available (requires HTTPS or localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(job.greetingMessage);
    } else {
      // Fallback for non-secure contexts
      const textarea = document.createElement("textarea");
      textarea.value = job.greetingMessage;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to copy greeting message";
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

watch(refreshInterval, (val) => {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;

  const entry = INTERVALS.find((item) => item.value === val);
  if (entry?.ms) {
    intervalId = setInterval(() => {
      void fetchJobs();
    }, entry.ms);
  }
});

watch(statusFilter, () => {
  void fetchJobs();
});

onMounted(() => {
  void fetchJobs();

  const entry = INTERVALS.find((item) => item.value === refreshInterval.value);
  if (entry?.ms) {
    intervalId = setInterval(() => {
      void fetchJobs();
    }, entry.ms);
  }
});

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId);
});
</script>

<template>
  <div class="page-shell">
    <div class="page-glow page-glow-left" />
    <div class="page-glow page-glow-right" />

    <main class="app">
      <section class="hero">
        <div>
          <p class="eyebrow">RemoteYeah Tracker</p>
          <h1>Vacancies</h1>
          <p class="hero-copy">Generated CVs stay pinned at the top. Filter fast, update status inline, and open the application page directly.</p>
        </div>
        <div class="toolbar">
          <label>
            API base
            <input
              v-model="apiBase"
              type="text"
              placeholder="http://localhost:4040"
              class="api-input"
              @blur="saveApiBase"
              @keydown.enter="saveApiBase"
            />
          </label>
          <label>
            Refresh
            <select v-model="refreshInterval">
              <option v-for="item in INTERVALS" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </label>
        </div>
      </section>

      <section class="status-filters" aria-label="Status filters">
        <button
          class="filter-chip"
          :class="{ active: statusFilter === '' }"
          type="button"
          @click="statusFilter = ''"
        >
          All <span class="chip-count">{{ totalJobs }}</span>
        </button>
        <button
          v-for="status in STATUSES"
          :key="status"
          class="filter-chip"
          :class="{ active: statusFilter === status }"
          type="button"
          @click="toggleStatusFilter(status)"
        >
          {{ status }} <span class="chip-count">{{ statusCounts[status] }}</span>
        </button>
      </section>

      <section class="search-filters" aria-label="Text filters">
        <label>
          Domain
          <input v-model="domainFilter" type="text" placeholder="min 3 chars" class="filter-input" />
        </label>
        <label>
          Company
          <input v-model="companyFilter" type="text" placeholder="min 3 chars" class="filter-input" />
        </label>
        <label>
          Position
          <input v-model="titleFilter" type="text" placeholder="min 3 chars" class="filter-input" />
        </label>
      </section>

      <p v-if="error" class="error-msg">{{ error }}</p>
      <p v-else-if="loading" class="loading">Loading…</p>

      <template v-else>
        <div class="table-wrap">
          <div class="jobs-table">
            <div class="jobs-head">
              <div>Rate</div>
              <div>Position</div>
              <div>Company</div>
              <div>Status</div>
              <div>Salary</div>
              <div>Domain</div>
              <div>Vacancy</div>
              <div>Greeting</div>
              <div>CV</div>
            </div>

            <div v-for="job in filteredJobs" :key="job._id" class="jobs-row">
              <div>
                <span class="rate-cell" :class="getMatchRateClass(job.matchRate)">
                  {{ formatMatchRate(job.matchRate) }}
                </span>
              </div>
              <div class="position-cell">
                <strong>{{ job.title || "—" }}</strong>
              </div>
              <div class="company-cell">
                <span>{{ job.companyName || "—" }}</span>
              </div>
              <div>
                <select
                  :value="job.status"
                  @change="updateStatus(job._id, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="status in STATUSES" :key="status" :value="status">{{ status }}</option>
                </select>
              </div>
              <div>
                <span>{{ job.salary || "—" }}</span>
              </div>
              <div>
                <span>{{ getTopLevelDomain(job.domain) || "—" }}</span>
              </div>
              <div>
                <a
                  v-if="job.applicationUrl"
                  :href="job.applicationUrl"
                  target="_blank"
                  rel="noopener"
                  class="action-link"
                  aria-label="Open vacancy"
                  title="Open vacancy"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M14 5h5v5M10 14 19 5M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                  </svg>
                </a>
                <span v-else class="text-muted">—</span>
              </div>
              <div>
                <button
                  v-if="job.greetingMessage"
                  type="button"
                  class="icon-button action-link"
                  aria-label="Copy greeting message"
                  title="Copy greeting message"
                  @click="copyGreetingMessage(job)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M9 9a2 2 0 0 1 2-2h8v10a2 2 0 0 1-2 2h-8z"
                      fill="none"
                      stroke="currentColor"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                    <path
                      d="M15 7V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"
                      fill="none"
                      stroke="currentColor"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                  </svg>
                </button>
                <span v-else class="text-muted">—</span>
              </div>
              <div>
                <a
                  v-if="job.cvUrl"
                  :href="getCvDownloadUrl(job)"
                  :download="getCvFileName(job)"
                  class="cv-link action-link"
                  aria-label="Download CV PDF"
                  title="Download CV PDF"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
                      fill="none"
                      stroke="currentColor"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                    <path
                      d="M14 3v5h5M8 16h8M8 12h3"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                  </svg>
                </a>
                <span v-else class="text-muted">—</span>
              </div>
            </div>
          </div>
        </div>

        <div class="cards">
          <article v-for="job in filteredJobs" :key="job._id" class="job-card">
            <div class="job-card-head">
              <p class="card-kicker">{{ job.status }}</p>
              <h2>{{ job.title || "—" }}</h2>
            </div>

            <div class="row">
              <span class="label">Rate</span>
              <span class="rate-cell" :class="getMatchRateClass(job.matchRate)">
                {{ formatMatchRate(job.matchRate) }}
              </span>
            </div>

            <div class="row">
              <span class="label">Company</span>
              <span>{{ job.companyName || "—" }}</span>
            </div>

            <div class="row">
              <span class="label">Status</span>
              <select
                :value="job.status"
                @change="updateStatus(job._id, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="status in STATUSES" :key="status" :value="status">{{ status }}</option>
              </select>
            </div>

            <div class="row">
              <span class="label">Salary</span>
              <span>{{ job.salary || "—" }}</span>
            </div>

            <div class="row">
              <span class="label">Domain</span>
              <span>{{ getTopLevelDomain(job.domain) || "—" }}</span>
            </div>

            <div class="row">
              <span class="label">Vacancy</span>
              <a
                v-if="job.applicationUrl"
                :href="job.applicationUrl"
                target="_blank"
                rel="noopener"
                class="action-link"
                aria-label="Open vacancy"
                title="Open vacancy"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M14 5h5v5M10 14 19 5M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                </svg>
              </a>
              <span v-else class="text-muted">—</span>
            </div>

            <div class="row">
              <span class="label">Greeting</span>
              <button
                v-if="job.greetingMessage"
                type="button"
                class="icon-button action-link"
                aria-label="Copy greeting message"
                title="Copy greeting message"
                @click="copyGreetingMessage(job)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M9 9a2 2 0 0 1 2-2h8v10a2 2 0 0 1-2 2h-8z"
                    fill="none"
                    stroke="currentColor"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                  <path
                    d="M15 7V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"
                    fill="none"
                    stroke="currentColor"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                </svg>
              </button>
              <span v-else class="text-muted">—</span>
            </div>

            <div class="row">
              <span class="label">CV</span>
              <a
                v-if="job.cvUrl"
                :href="getCvDownloadUrl(job)"
                :download="getCvFileName(job)"
                class="cv-link action-link"
                aria-label="Download CV PDF"
                title="Download CV PDF"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
                    fill="none"
                    stroke="currentColor"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                  <path
                    d="M14 3v5h5M8 16h8M8 12h3"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                </svg>
              </a>
              <span v-else class="text-muted">—</span>
            </div>
          </article>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.page-shell {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
}

.page-glow {
  position: absolute;
  width: 28rem;
  height: 28rem;
  border-radius: 999px;
  filter: blur(90px);
  opacity: 0.18;
  pointer-events: none;
}

.page-glow-left {
  top: -8rem;
  left: -10rem;
  background: #3dd9b4;
}

.page-glow-right {
  top: 4rem;
  right: -12rem;
  background: #ff7a59;
}

.hero {
  display: grid;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.eyebrow {
  margin: 0 0 0.5rem;
  color: #7dd3fc;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero h1 {
  margin: 0;
  font-size: clamp(2.2rem, 6vw, 4.2rem);
  line-height: 0.95;
}

.hero-copy {
  max-width: 42rem;
  color: var(--text-muted);
}

.api-input {
  width: min(24rem, 100%);
  background: rgba(16, 18, 24, 0.8);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.8rem 1rem;
  font-size: 0.95rem;
}

.status-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.search-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.9rem;
  margin-bottom: 1.5rem;
}

.search-filters label {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.filter-input {
  width: 100%;
  background: rgba(16, 18, 24, 0.8);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.8rem 1rem;
  font-size: 0.95rem;
}

.filter-chip {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 0.7rem 1rem;
  text-transform: capitalize;
}

.filter-chip.active {
  background: linear-gradient(135deg, #3dd9b4, #7dd3fc);
  color: #07111b;
}

.chip-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: rgba(7, 17, 27, 0.16);
  font-size: 0.76rem;
  font-weight: 700;
}

.table-wrap {
  overflow-x: auto;
}

.jobs-table {
  display: grid;
  gap: 0.75rem;
}

.jobs-head,
.jobs-row {
  display: grid;
  grid-template-columns:
    4.25rem
    minmax(12rem, 1.5fr)
    minmax(4.5rem, 0.5fr)
    8.5rem
    minmax(6.5rem, 0.7fr)
    minmax(7rem, 0.75fr)
    5.5rem
    5.5rem
    4.5rem;
  gap: 0.75rem;
  align-items: center;
}

.jobs-head {
  padding: 0 1.25rem;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.jobs-row {
  padding: 1rem 1.25rem;
  background: rgba(13, 17, 23, 0.75);
  border: 1px solid rgba(125, 211, 252, 0.12);
  border-radius: 1.25rem;
  backdrop-filter: blur(12px);
}

.position-cell strong {
  font-size: 1rem;
  line-height: 1.35;
}

.company-cell {
  word-break: break-word;
  line-height: 1.25;
  font-size: 0.9rem;
}

.jobs-row select {
  width: 100%;
  min-width: 0;
}

.jobs-row .icon-button,
.jobs-row .cv-link,
.jobs-row .action-link {
  min-width: 0;
  width: 100%;
}

.cards {
  display: grid;
  gap: 1rem;
}

.job-card {
  padding: 1rem;
  background: rgba(13, 17, 23, 0.78);
  border: 1px solid rgba(125, 211, 252, 0.12);
  border-radius: 1.25rem;
  backdrop-filter: blur(12px);
}

.job-card-head {
  margin-bottom: 1rem;
}

.job-card-head h2 {
  margin: 0;
  font-size: 1.1rem;
}

.card-kicker {
  margin: 0 0 0.35rem;
  color: #7dd3fc;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.75rem;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0;
}

.label {
  color: var(--text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.cv-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 3rem;
  border-radius: 999px;
  background: linear-gradient(135deg, #ff7a59, #ffd166);
  color: #151515;
  font-weight: 700;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 3rem;
  border: 1px solid rgba(125, 211, 252, 0.2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-weight: 700;
}

.action-link {
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
}

.action-link svg {
  width: 1.1rem;
  height: 1.1rem;
}

.cv-link:hover {
  color: #151515;
  text-decoration: none;
}

.text-muted {
  color: var(--text-muted);
}

.rate-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 3.25rem;
  min-height: 2.2rem;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.rate-low {
  background: rgba(248, 113, 113, 0.15);
  color: #fca5a5;
}

.rate-mid {
  background: rgba(250, 204, 21, 0.14);
  color: #fde68a;
}

.rate-high {
  background: rgba(74, 222, 128, 0.14);
  color: #86efac;
}

.rate-empty {
  min-width: 0;
  min-height: 0;
  padding: 0;
  background: transparent;
}
</style>
