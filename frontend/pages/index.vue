<script setup lang="ts">
type JobStatus = "pending" | "saved" | "generated" | "applied" | "cancelled" | "error";

type Job = {
  _id: string;
  title?: string;
  companyName?: string;
  url?: string;
  applicationUrl?: string;
  status: JobStatus;
  cvUrl?: string;
  greetingMessage?: string;
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

function saveApiBase() {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("apiBase", apiBase.value);
  }
  refreshJobs();
}

function getVacancyUrl(job: Job) {
  return job.applicationUrl || job.url || "";
}

function getCvDownloadUrl(job: Job) {
  const base = apiBase.value.replace(/\/$/, "");
  return `${base}/api/jobs/${job._id}/cv`;
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
    await navigator.clipboard.writeText(job.greetingMessage);
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
              placeholder="http://localhost:3000"
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

      <p v-if="error" class="error-msg">{{ error }}</p>
      <p v-else-if="loading" class="loading">Loading…</p>

      <template v-else>
        <div class="table-wrap">
          <div class="jobs-table">
            <div class="jobs-head">
              <div>Position</div>
              <div>Company</div>
              <div>Vacancy</div>
              <div>Status</div>
              <div>Greeting</div>
              <div>CV</div>
            </div>

            <div v-for="job in jobs" :key="job._id" class="jobs-row">
              <div class="position-cell">
                <strong>{{ job.title || "—" }}</strong>
              </div>
              <div>
                <span>{{ job.companyName || "—" }}</span>
              </div>
              <div>
                <a v-if="getVacancyUrl(job)" :href="getVacancyUrl(job)" target="_blank" rel="noopener">
                  Open vacancy
                </a>
                <span v-else class="text-muted">—</span>
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
                <button
                  v-if="job.greetingMessage"
                  type="button"
                  class="icon-button"
                  aria-label="Copy greeting message"
                  title="Copy greeting message"
                  @click="copyGreetingMessage(job)"
                >
                  Copy
                </button>
                <span v-else class="text-muted">—</span>
              </div>
              <div>
                <a
                  v-if="job.cvUrl"
                  :href="getCvDownloadUrl(job)"
                  class="cv-link"
                  download
                  aria-label="Download CV PDF"
                >
                  PDF
                </a>
                <span v-else class="text-muted">—</span>
              </div>
            </div>
          </div>
        </div>

        <div class="cards">
          <article v-for="job in jobs" :key="job._id" class="job-card">
            <div class="job-card-head">
              <p class="card-kicker">{{ job.status }}</p>
              <h2>{{ job.title || "—" }}</h2>
            </div>

            <div class="row">
              <span class="label">Company</span>
              <span>{{ job.companyName || "—" }}</span>
            </div>

            <div class="row">
              <span class="label">Vacancy</span>
              <a v-if="getVacancyUrl(job)" :href="getVacancyUrl(job)" target="_blank" rel="noopener">
                Open vacancy
              </a>
              <span v-else class="text-muted">—</span>
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
              <span class="label">CV</span>
              <a
                v-if="job.cvUrl"
                :href="getCvDownloadUrl(job)"
                class="cv-link"
                download
                aria-label="Download CV PDF"
              >
                PDF
              </a>
              <span v-else class="text-muted">—</span>
            </div>

            <div class="row">
              <span class="label">Greeting</span>
              <button
                v-if="job.greetingMessage"
                type="button"
                class="icon-button"
                aria-label="Copy greeting message"
                title="Copy greeting message"
                @click="copyGreetingMessage(job)"
              >
                Copy
              </button>
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
    minmax(14rem, 1.7fr)
    minmax(10rem, 1fr)
    minmax(10rem, 1.1fr)
    minmax(9rem, 0.8fr)
    minmax(6rem, 0.7fr)
    5rem;
  gap: 1rem;
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
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  background: linear-gradient(135deg, #ff7a59, #ffd166);
  color: #151515;
  font-weight: 700;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 4rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid rgba(125, 211, 252, 0.2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-weight: 700;
}

.cv-link:hover {
  color: #151515;
  text-decoration: none;
}

.text-muted {
  color: var(--text-muted);
}
</style>
