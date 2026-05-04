<script setup lang="ts">
const route = useRoute();
const config = useRuntimeConfig();

const apiBase = ref(
  typeof localStorage !== "undefined"
    ? (localStorage.getItem("apiBase") || config.public.apiBase)
    : config.public.apiBase
);

const job = ref<Record<string, any> | null>(null);
const loading = ref(true);
const error = ref("");

async function fetchJob() {
  const base = apiBase.value.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/v1/jobs/${route.params.id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    job.value = data;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load job";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchJob();
});
</script>

<template>
  <div class="page-shell">
    <div class="page-glow page-glow-left" />
    <div class="page-glow page-glow-right" />

    <main class="app">
      <section class="hero">
        <div>
          <NuxtLink to="/" class="back-link">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
              <path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Back to Vacancies
          </NuxtLink>
          <p class="eyebrow" v-if="job">Job Details</p>
          <h1>{{ job?.title || "Loading..." }}</h1>
        </div>
      </section>

      <p v-if="error" class="error-msg">{{ error }}</p>
      <p v-else-if="loading" class="loading">Loading…</p>
      
      <div v-else-if="job" class="job-details-container">
        <div v-for="(value, key) in job" :key="key">
          <section v-if="value !== null && value !== undefined && value !== '' && key !== '_id' && key !== '__v' && key !== 'title'" class="detail-section">
            <h3 class="detail-label">{{ String(key).replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) }}</h3>
            
            <div v-if="key === 'description'" class="detail-content description-content" v-html="value"></div>
            <div v-else-if="key === 'applicationUrl' || key === 'url' || String(key).toLowerCase().includes('url')">
              <a :href="value" target="_blank" rel="noopener" class="detail-link">{{ value }}</a>
            </div>
            <div v-else-if="Array.isArray(value)" class="detail-tags">
              <span v-for="item in value" :key="item" class="tag">{{ item }}</span>
            </div>
            <pre v-else-if="typeof value === 'object'" class="detail-pre">{{ JSON.stringify(value, null, 2) }}</pre>
            <div v-else class="detail-content">{{ value }}</div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page-shell {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  padding-bottom: 4rem;
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
  margin-bottom: 2rem;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  transition: color 0.2s ease;
}

.back-link:hover {
  color: #7dd3fc;
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
  font-size: clamp(2.2rem, 5vw, 3.5rem);
  line-height: 1.1;
}

.job-details-container {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: minmax(0, 1fr);
}

.detail-section {
  background: rgba(13, 17, 23, 0.6);
  border: 1px solid rgba(125, 211, 252, 0.1);
  border-radius: 1rem;
  padding: 1.5rem;
  backdrop-filter: blur(12px);
  overflow-wrap: break-word;
}

.detail-label {
  margin: 0 0 0.75rem;
  color: #7dd3fc;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.detail-content {
  color: var(--text);
  font-size: 1rem;
  line-height: 1.6;
}

.description-content {
  max-height: none;
  padding-right: 0;
}

.detail-link {
  color: #3dd9b4;
  text-decoration: none;
}

.detail-link:hover {
  text-decoration: underline;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tag {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  font-size: 0.85rem;
  color: var(--text);
}

.detail-pre {
  background: rgba(0, 0, 0, 0.3);
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9rem;
  color: #a78bfa;
}

.error-msg {
  color: #fca5a5;
  background: rgba(248, 113, 113, 0.15);
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(248, 113, 113, 0.3);
}

.loading {
  color: var(--text-muted);
  font-size: 1.1rem;
}
</style>
