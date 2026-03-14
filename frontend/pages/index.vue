<script setup lang="ts">
type JobStatus = "pending" | "saved" | "generated" | "started" | "applied" | "cancelled" | "error";

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
  email?: string;
  topTechAndSkills?: string;
  whyAnswer?: string;
  matchRate?: number | null;
};

const config = useRuntimeConfig();
const apiBase = ref(
  typeof localStorage !== "undefined"
    ? (localStorage.getItem("apiBase") || config.public.apiBase)
    : config.public.apiBase
);

const linkedinProfile = ref("");
const githubProfile = ref("");
const b2bText = ref("");
const blinkingButton = ref<string | null>(null);

const jobs = ref<Job[]>([]);
const loading = ref(true);
const error = ref("");
const statusFilter = ref<JobStatus | "">("");
const refreshInterval = ref("0");
const domainFilter = ref("");
const companyFilter = ref("");
const titleFilter = ref("");
const everywhereFilter = ref("");

const liveStats = ref<Partial<Record<JobStatus, number>>>({});
let statsSource: EventSource | null = null;

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

const STATUSES: JobStatus[] = ["pending", "saved", "generated", "started", "applied", "cancelled", "error"];

const statusCounts = computed(() => {
  const counts: Record<JobStatus, number> = {
    pending: 0,
    saved: 0,
    generated: 0,
    started: 0,
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
  const everywhereNeedle = normalizeFilterValue(everywhereFilter.value);

  return jobs.value.filter((job) => {
    if (everywhereNeedle) {
      const jobString = JSON.stringify(job).toLowerCase();
      if (!jobString.includes(everywhereNeedle)) {
        return false;
      }
    }

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
  
  return `${base}/api/v1/jobs/${job._id}/cv`;
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
    const res = await fetch(`${base}/api/v1/jobs/${id}`, {
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

async function handleVacancyClick(job: Job, event: MouseEvent) {
  if (job.status === "generated") {
    event.preventDefault();
    await updateStatus(job._id, "started");
    // Open the link after updating status
    if (job.applicationUrl) {
      window.open(job.applicationUrl, "_blank", "noopener");
    }
  }
}

async function copyWithBlink(text: string, buttonId: string) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    
    blinkingButton.value = buttonId;
    setTimeout(() => {
      blinkingButton.value = null;
    }, 300);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to copy";
  }
}

async function copyGreetingMessage(job: Job) {
  if (!job.greetingMessage) return;
  await copyWithBlink(job.greetingMessage, `greeting-${job._id}`);
}

async function copyEmail(job: Job) {
  if (!job.email) return;
  await copyWithBlink(job.email, `email-${job._id}`);
}

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to copy";
  }
}

async function copyWhyAnswer(job: Job) {
  if (!job.whyAnswer) return;
  await copyWithBlink(job.whyAnswer, `why-${job._id}`);
}

async function fetchProfiles() {
  try {
    const base = apiBase.value.replace(/\/$/, "");
    const res = await fetch(`${base}/api/v1/copy`);
    if (res.ok) {
      const data = await res.json();
      linkedinProfile.value = data.linkedin || "";
      githubProfile.value = data.github || "";
      b2bText.value = data.b2b || "";
    }
  } catch (e) {
    // Silently fail - profiles are optional
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
  const sseBase = apiBase.value.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  statsSource = new EventSource(`${sseBase}/api/v1/stats/stream`);
  statsSource.onmessage = (e: MessageEvent) => {
    try {
      Object.assign(liveStats.value, JSON.parse(e.data));
    } catch {}
  };
  statsSource.onerror = () => {
    statsSource?.close();
    statsSource = null;
  };

  void fetchJobs();
  void fetchProfiles();

  const entry = INTERVALS.find((item) => item.value === refreshInterval.value);
  if (entry?.ms) {
    intervalId = setInterval(() => {
      void fetchJobs();
    }, entry.ms);
  }
});

onUnmounted(() => {
  statsSource?.close();
  statsSource = null;
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
          
          <div v-if="linkedinProfile || githubProfile || b2bText" class="profile-links">
            <button
              v-if="linkedinProfile"
              type="button"
              class="profile-btn"
              aria-label="Copy LinkedIn profile"
              title="Copy LinkedIn profile"
              @click="copyToClipboard(linkedinProfile)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
                  fill="currentColor"
                />
              </svg>
              LinkedIn
            </button>
            <button
              v-if="githubProfile"
              type="button"
              class="profile-btn"
              aria-label="Copy GitHub profile"
              title="Copy GitHub profile"
              @click="copyToClipboard(githubProfile)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                  fill="currentColor"
                />
              </svg>
              GitHub
            </button>
            <button
              v-if="b2bText"
              type="button"
              class="profile-btn"
              aria-label="Copy B2B text"
              title="Copy B2B text"
              @click="copyToClipboard(b2bText)"
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
              B2B
            </button>
          </div>
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

      <section class="stats-widget" aria-label="Live job counts">
        <button
          v-for="status in STATUSES"
          :key="status"
          class="stats-badge"
          :class="[`stats-badge--${status}`, { active: statusFilter === status }]"
          type="button"
          @click="toggleStatusFilter(status)"
        >
          <span class="stats-badge-label">{{ status }}</span>
          <span class="stats-badge-count">{{ liveStats[status] ?? statusCounts[status] }}</span>
        </button>
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
          Everywhere
          <input v-model="everywhereFilter" type="text" placeholder="min 3 chars" class="filter-input" />
        </label>
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
              <div>Copy</div>
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
                <small v-if="job.topTechAndSkills" class="tech-skills">{{ job.topTechAndSkills }}</small>
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
                  @click="handleVacancyClick(job, $event)"
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
              <div class="copy-buttons">
                <button
                  v-if="job.greetingMessage"
                  type="button"
                  class="icon-button action-link"
                  :class="{ blink: blinkingButton === `greeting-${job._id}` }"
                  aria-label="Copy greeting message"
                  title="Copy greeting message"
                  @click="copyGreetingMessage(job)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                      fill="none"
                      stroke="currentColor"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                    <path
                      d="m22 6-10 7L2 6"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                  </svg>
                </button>
                <button
                  v-if="job.email"
                  type="button"
                  class="icon-button action-link"
                  :class="{ blink: blinkingButton === `email-${job._id}` }"
                  aria-label="Copy email"
                  title="Copy email"
                  @click="copyEmail(job)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/>
                    <path d="M16 12a4 4 0 0 1 4 4v1a1 1 0 0 0 2 0v-1a8 8 0 1 0-8 8h1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>
                  </svg>
                </button>
                <button
                  v-if="job.whyAnswer"
                  type="button"
                  class="icon-button action-link"
                  :class="{ blink: blinkingButton === `why-${job._id}` }"
                  aria-label="Copy why answer"
                  title="Copy why answer"
                  @click="copyWhyAnswer(job)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"
                      fill="none"
                      stroke="currentColor"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                    <path
                      d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                  </svg>
                </button>
                <span v-if="!job.greetingMessage && !job.email && !job.whyAnswer" class="text-muted">—</span>
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
              <small v-if="job.topTechAndSkills" class="tech-skills">{{ job.topTechAndSkills }}</small>
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
                @click="handleVacancyClick(job, $event)"
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
              <span class="label">Copy</span>
              <div class="copy-buttons">
                <button
                  v-if="job.greetingMessage"
                  type="button"
                  class="icon-button action-link"
                  :class="{ blink: blinkingButton === `greeting-${job._id}` }"
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
                <button
                  v-if="job.email"
                  type="button"
                  class="icon-button action-link"
                  :class="{ blink: blinkingButton === `email-${job._id}` }"
                  aria-label="Copy email"
                  title="Copy email"
                  @click="copyEmail(job)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/>
                    <path d="M16 12a4 4 0 0 1 4 4v1a1 1 0 0 0 2 0v-1a8 8 0 1 0-8 8h1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>
                  </svg>
                </button>
                <button
                  v-if="job.whyAnswer"
                  type="button"
                  class="icon-button action-link"
                  :class="{ blink: blinkingButton === `why-${job._id}` }"
                  aria-label="Copy why answer"
                  title="Copy why answer"
                  @click="copyWhyAnswer(job)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"
                      fill="none"
                      stroke="currentColor"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                    <path
                      d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.8"
                    />
                  </svg>
                </button>
                <span v-if="!job.greetingMessage && !job.email && !job.whyAnswer" class="text-muted">—</span>
              </div>
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

.profile-links {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.25rem;
  flex-wrap: wrap;
}

.profile-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1.1rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(125, 211, 252, 0.2);
  border-radius: 999px;
  color: var(--text);
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.2s ease;
  cursor: pointer;
}

.profile-btn:hover {
  background: rgba(125, 211, 252, 0.12);
  border-color: rgba(125, 211, 252, 0.4);
  transform: translateY(-1px);
}

.profile-btn svg {
  width: 1.1rem;
  height: 1.1rem;
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
    minmax(10rem, 1fr)
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
  padding: 0.75rem;
  background: rgba(13, 17, 23, 0.75);
  border: 1px solid rgba(125, 211, 252, 0.12);
  border-radius: 1.25rem;
  backdrop-filter: blur(12px);
}

.copy-buttons {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.position-cell strong {
  font-size: 1rem;
  line-height: 1.35;
}

.position-cell small.tech-skills {
  display: block;
  margin-top: 0.25rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 400;
  line-height: 1.3;
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

.job-card-head small.tech-skills {
  display: block;
  margin-top: 0.35rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 400;
  line-height: 1.3;
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
  transition: all 0.15s ease;
}

.icon-button.blink {
  animation: blinkEffect 0.3s ease;
}

@keyframes blinkEffect {
  0%, 100% {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(125, 211, 252, 0.2);
  }
  50% {
    background: rgba(61, 217, 180, 0.3);
    border-color: rgba(61, 217, 180, 0.6);
  }
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

.stats-widget {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.stats-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  text-transform: capitalize;
  cursor: pointer;
  transition: all 0.15s ease;
}

.stats-badge.active,
.stats-badge:hover {
  border-color: rgba(125, 211, 252, 0.4);
  background: rgba(125, 211, 252, 0.1);
  color: var(--text);
}

.stats-badge-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: rgba(7, 17, 27, 0.2);
  font-size: 0.74rem;
  font-weight: 700;
}

.stats-badge--pending .stats-badge-count { background: rgba(250, 204, 21, 0.15); color: #fde68a; }
.stats-badge--saved .stats-badge-count { background: rgba(125, 211, 252, 0.15); color: #7dd3fc; }
.stats-badge--generated .stats-badge-count { background: rgba(74, 222, 128, 0.15); color: #86efac; }
.stats-badge--started .stats-badge-count { background: rgba(167, 139, 250, 0.15); color: #c4b5fd; }
.stats-badge--applied .stats-badge-count { background: rgba(61, 217, 180, 0.15); color: #3dd9b4; }
.stats-badge--cancelled .stats-badge-count { background: rgba(255, 255, 255, 0.08); color: var(--text-muted); }
.stats-badge--error .stats-badge-count { background: rgba(248, 113, 113, 0.15); color: #fca5a5; }
</style>
