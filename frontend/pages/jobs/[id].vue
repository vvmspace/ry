<script setup lang="ts">
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';

marked.use(markedKatex({ throwOnError: false }));

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

const editingField = ref<string | null>(null);
const editValue = ref("");
const textareaRef = ref<HTMLTextAreaElement | null>(null);

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

async function saveField(key: string) {
  if (!job.value || !job.value._id) return;
  const originalValue = String(job.value[key] || "");
  
  if (editValue.value === originalValue) {
    editingField.value = null;
    return;
  }

  const base = apiBase.value.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/v1/jobs/${job.value._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: editValue.value })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    job.value = data;
  } catch (e) {
    alert(e instanceof Error ? e.message : "Failed to save field");
  } finally {
    editingField.value = null;
  }
}

function startEdit(key: string, value: any) {
  editingField.value = key;
  editValue.value = String(value || "");
  nextTick(() => {
    textareaRef.value?.focus();
  });
}

const generatingLegend = ref(false);
async function generateLegend() {
  if (!job.value || !job.value._id) return;
  generatingLegend.value = true;
  const base = apiBase.value.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/v1/jobs/${job.value._id}/legend`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    job.value = data;
  } catch (e) {
    alert(e instanceof Error ? e.message : "Failed to generate legend");
  } finally {
    generatingLegend.value = false;
  }
}

const generatingBestCandidate = ref(false);
async function generateBestCandidate() {
  if (!job.value || !job.value._id) return;
  generatingBestCandidate.value = true;
  const base = apiBase.value.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/v1/jobs/${job.value._id}/best_candidate`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    job.value = data;
  } catch (e) {
    alert(e instanceof Error ? e.message : "Failed to generate best candidate");
  } finally {
    generatingBestCandidate.value = false;
  }
}

const generatingCv = ref(false);
async function generateCv() {
  if (!job.value || !job.value._id) return;
  generatingCv.value = true;
  const base = apiBase.value.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/v1/jobs/${job.value._id}/cv`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    job.value = data;
  } catch (e) {
    alert(e instanceof Error ? e.message : "Failed to generate CV");
  } finally {
    generatingCv.value = false;
  }
}

function renderMarkdown(text: any) {
  if (!text) return "";
  if (typeof text !== 'string') return String(text);
  return marked.parse(text);
}

function formatLabel(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

const excludedKeys = ['_id', '__v', 'createdAt', 'updatedAt', 'title', 'legendStartedAt', 'bestCandidateStartedAt', 'screeningQuestionsAnswersStartedAt', 'ratingStartedAt', 'coverLetterStartedAt', 'cvGenerationComment'];

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
          <p v-if="job?.companyName" class="hero-company">{{ job.companyName }}</p>
        </div>
      </section>

      <p v-if="error" class="error-msg">{{ error }}</p>
      <div v-else-if="loading" class="loading-container">
        <div class="loader"></div>
        <p class="loading">Loading vacancy details…</p>
      </div>
      
      <div v-else-if="job" class="job-details-container">
        <!-- CV Generation Section -->
        <section class="detail-section highlight-section cv-section">
          <div class="section-header">
            <h3 class="detail-label">CV Generation</h3>
            <button @click="generateCv" :disabled="generatingCv" class="generate-btn cv-btn">
              {{ generatingCv ? 'Generating...' : 'Generate CV' }}
            </button>
          </div>
          
          <div class="field-group">
            <label class="field-label">CV Generation Comment / Instructions</label>
            <div v-if="editingField === 'cvGenerationComment'" class="edit-mode">
              <textarea ref="textareaRef" v-model="editValue" @blur="saveField('cvGenerationComment')" class="edit-textarea"></textarea>
            </div>
            <div v-else @click="startEdit('cvGenerationComment', job.cvGenerationComment)" class="detail-content markdown-body" v-html="renderMarkdown(job.cvGenerationComment || '*Add instructions for CV generation here...*')"></div>
          </div>

          <div v-if="job.cvUrl || job.cvPdfUrl || job.cvHtmlUrl" class="cv-links">
            <a v-if="job.cvPdfUrl || job.cvUrl" :href="job.cvPdfUrl || job.cvUrl" target="_blank" class="cv-link-badge pdf">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              Download PDF
            </a>
            <a v-if="job.cvHtmlUrl" :href="job.cvHtmlUrl" target="_blank" class="cv-link-badge html">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              View HTML
            </a>
            <a v-if="job.cvJsonUrl" :href="job.cvJsonUrl" target="_blank" class="cv-link-badge json">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 12 12 16.5 14.6 16.5 19.79"/><polyline points="12 21.19 12 12"/></svg>
              View JSON
            </a>
          </div>
        </section>

        <!-- AI Generatable Sections First -->
        <section class="detail-section highlight-section">
          <div class="section-header">
            <h3 class="detail-label">Legend</h3>
            <button @click="generateLegend" :disabled="generatingLegend" class="generate-btn">
              {{ generatingLegend ? 'Generating...' : 'Generate' }}
            </button>
          </div>
          <div v-if="editingField === 'legend'" class="edit-mode">
            <textarea ref="textareaRef" v-model="editValue" @blur="saveField('legend')" class="edit-textarea"></textarea>
          </div>
          <div v-else @click="startEdit('legend', job.legend)" class="detail-content markdown-body" v-html="renderMarkdown(job.legend || '*No legend generated yet. Click to edit or use the Generate button.*')"></div>
        </section>

        <section class="detail-section highlight-section">
          <div class="section-header">
            <h3 class="detail-label">Best Candidate</h3>
            <button @click="generateBestCandidate" :disabled="generatingBestCandidate" class="generate-btn">
              {{ generatingBestCandidate ? 'Generating...' : 'Generate' }}
            </button>
          </div>
          <div v-if="editingField === 'bestCandidate'" class="edit-mode">
            <textarea ref="textareaRef" v-model="editValue" @blur="saveField('bestCandidate')" class="edit-textarea"></textarea>
          </div>
          <div v-else @click="startEdit('bestCandidate', job.bestCandidate)" class="detail-content markdown-body" v-html="renderMarkdown(job.bestCandidate || '*No best candidate profile generated yet. Click to edit or use the Generate button.*')"></div>
        </section>

        <!-- Dynamic Fields -->
        <div v-for="(value, key) in job" :key="key">
          <section v-if="!excludedKeys.includes(key as string) && key !== 'legend' && key !== 'bestCandidate' && value !== null && value !== undefined && value !== ''" class="detail-section">
            <h3 class="detail-label">{{ formatLabel(key as string) }}</h3>
            
            <!-- Link Fields -->
            <div v-if="String(key).toLowerCase().includes('url')">
              <a :href="value" target="_blank" rel="noopener" class="detail-link">{{ value }}</a>
            </div>

            <!-- Tag Fields -->
            <div v-else-if="Array.isArray(value)" class="detail-tags">
              <span v-for="item in value" :key="item" class="tag">{{ item }}</span>
            </div>

            <!-- Object/JSON Fields -->
            <pre v-else-if="typeof value === 'object'" class="detail-pre">{{ JSON.stringify(value, null, 2) }}</pre>

            <!-- Editable Text/Markdown Fields -->
            <div v-else>
              <div v-if="editingField === key" class="edit-mode">
                <textarea ref="textareaRef" v-model="editValue" @blur="saveField(key as string)" class="edit-textarea"></textarea>
              </div>
              <div v-else @click="startEdit(key as string, value)" class="detail-content markdown-body" v-html="renderMarkdown(value)"></div>
            </div>
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
  padding-bottom: 5rem;
}

.page-glow {
  position: absolute;
  width: 35rem;
  height: 35rem;
  border-radius: 999px;
  filter: blur(120px);
  opacity: 0.15;
  pointer-events: none;
  z-index: -1;
}

.page-glow-left {
  top: -10rem;
  left: -15rem;
  background: #3dd9b4;
}

.page-glow-right {
  bottom: 0;
  right: -15rem;
  background: #7dd3fc;
}

.hero {
  margin-bottom: 3rem;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 2rem;
  transition: all 0.2s ease;
}

.back-link:hover {
  color: #7dd3fc;
  transform: translateX(-4px);
}

.eyebrow {
  margin: 0 0 0.75rem;
  color: #3dd9b4;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.hero h1 {
  margin: 0 0 0.5rem;
  font-size: clamp(2.5rem, 6vw, 4rem);
  line-height: 1.1;
  font-weight: 800;
  background: linear-gradient(135deg, #fff 0%, #7dd3fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-company {
  font-size: 1.25rem;
  color: var(--text-muted);
  font-weight: 500;
}

.job-details-container {
  display: grid;
  gap: 2rem;
}

.detail-section {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.5rem;
  padding: 2rem;
  backdrop-filter: blur(20px);
  transition: border-color 0.3s ease;
}

.detail-section:hover {
  border-color: rgba(125, 211, 252, 0.3);
}

.highlight-section {
  background: rgba(125, 211, 252, 0.05);
  border: 1px solid rgba(125, 211, 252, 0.2);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.detail-label {
  margin: 0;
  color: #7dd3fc;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.generate-btn {
  background: #3dd9b4;
  color: #0d1117;
  border: none;
  border-radius: 0.75rem;
  padding: 0.5rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.generate-btn:hover:not(:disabled) {
  background: #2cb898;
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(61, 217, 180, 0.3);
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.detail-content {
  color: var(--text);
  font-size: 1.05rem;
  line-height: 1.7;
  cursor: pointer;
  min-height: 1.5em;
}

.detail-content:hover {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.5rem;
}

.edit-mode {
  width: 100%;
}

.edit-textarea {
  width: 100%;
  min-height: 200px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #7dd3fc;
  border-radius: 0.75rem;
  color: #fff;
  padding: 1rem;
  font-size: 1.05rem;
  font-family: inherit;
  line-height: 1.7;
  resize: vertical;
  outline: none;
}

.markdown-body :deep(p) { margin-bottom: 1rem; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { margin-bottom: 1rem; padding-left: 1.5rem; }
.markdown-body :deep(h1), .markdown-body :deep(h2), .markdown-body :deep(h3) { 
  margin: 1.5rem 0 1rem; 
  color: #7dd3fc;
}
.markdown-body :deep(code) {
  background: rgba(0, 0, 0, 0.3);
  padding: 0.2rem 0.4rem;
  border-radius: 0.3rem;
  font-size: 0.9em;
}

.detail-link {
  color: #3dd9b4;
  text-decoration: none;
  font-weight: 600;
  word-break: break-all;
}

.detail-link:hover {
  text-decoration: underline;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.tag {
  background: rgba(61, 217, 180, 0.1);
  border: 1px solid rgba(61, 217, 180, 0.2);
  padding: 0.4rem 1rem;
  border-radius: 999px;
  font-size: 0.9rem;
  color: #3dd9b4;
  font-weight: 600;
}

.detail-pre {
  background: rgba(0, 0, 0, 0.4);
  padding: 1.5rem;
  border-radius: 1rem;
  overflow-x: auto;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9rem;
  color: #a78bfa;
  border: 1px solid rgba(167, 139, 250, 0.2);
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 5rem 0;
}

.loader {
  width: 3rem;
  height: 3rem;
  border: 3px solid rgba(61, 217, 180, 0.1);
  border-top-color: #3dd9b4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-msg {
  color: #fca5a5;
  background: rgba(248, 113, 113, 0.1);
  padding: 1.5rem;
  border-radius: 1rem;
  border: 1px solid rgba(248, 113, 113, 0.2);
  text-align: center;
}

.cv-section {
  border-color: #3dd9b444;
  background: rgba(61, 217, 180, 0.03);
}

.cv-btn {
  background: #3dd9b4;
  box-shadow: 0 4px 14px 0 rgba(61, 217, 180, 0.39);
}

.field-group {
  margin-top: 1rem;
}

.field-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.cv-links {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.cv-link-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s ease;
}

.cv-link-badge.pdf {
  background: rgba(248, 113, 113, 0.1);
  color: #fca5a5;
  border: 1px solid rgba(248, 113, 113, 0.2);
}

.cv-link-badge.html {
  background: rgba(167, 139, 250, 0.1);
  color: #a78bfa;
  border: 1px solid rgba(167, 139, 250, 0.2);
}

.cv-link-badge.json {
  background: rgba(96, 165, 250, 0.1);
  color: #60a5fa;
  border: 1px solid rgba(96, 165, 250, 0.2);
}

.cv-link-badge:hover {
  transform: translateY(-2px);
  filter: brightness(1.2);
}
</style>
