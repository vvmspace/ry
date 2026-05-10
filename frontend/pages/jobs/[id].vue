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
    const res = await fetch(`${base}/api/v1/jobs/${job.value._id}/legend`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    job.value = await res.json();
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
    const res = await fetch(`${base}/api/v1/jobs/${job.value._id}/best_candidate`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    job.value = await res.json();
  } catch (e) {
    alert(e instanceof Error ? e.message : "Failed to generate best candidate");
  } finally {
    generatingBestCandidate.value = false;
  }
}

const generatingScreeningQuestions = ref(false);
async function generateScreeningQuestions() {
  if (!job.value || !job.value._id) return;
  generatingScreeningQuestions.value = true;
  const base = apiBase.value.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/v1/jobs/${job.value._id}/screening_questions`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    job.value = await res.json();
  } catch (e) {
    alert(e instanceof Error ? e.message : "Failed to generate screening questions");
  } finally {
    generatingScreeningQuestions.value = false;
  }
}

const generatingCv = ref(false);
async function generateCv() {
  if (!job.value || !job.value._id) return;
  generatingCv.value = true;
  const base = apiBase.value.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/v1/jobs/${job.value._id}/cv`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    job.value = await res.json();
  } catch (e) {
    alert(e instanceof Error ? e.message : "Failed to generate CV");
  } finally {
    generatingCv.value = false;
  }
}

const generatingCoverLetter = ref(false);
async function generateCoverLetter() {
  if (!job.value || !job.value._id) return;
  generatingCoverLetter.value = true;
  const base = apiBase.value.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/v1/jobs/${job.value._id}/cover_letter`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    job.value = await res.json();
  } catch (e) {
    alert(e instanceof Error ? e.message : "Failed to generate cover letter");
  } finally {
    generatingCoverLetter.value = false;
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

function getRateClass(rate: number) {
  if (rate < 50) return 'rate-red';
  if (rate < 75) return 'rate-yellow';
  return 'rate-green';
}

const copiedField = ref<string | null>(null);
async function copyToClipboard(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text);
    copiedField.value = key;
    setTimeout(() => { copiedField.value = null; }, 2000);
  } catch (err) {
    console.error('Failed to copy: ', err);
  }
}

const handledKeys = [
  '_id', '__v', 'createdAt', 'updatedAt', 'title', 'matchRate', 
  'companyName', 'domain', 'salary', 'status', 'applicationUrl',
  'cvUrl', 'cvPdfUrl', 'cvHtmlUrl', 'cvJsonUrl', 'jsonUrl',
  'legend', 'bestCandidate', 'screeningQuestionsAnswers', 'coverLetter',
  'topTechAndSkills', 'greetingMessage', 'coverLetter', 'email', 'whyAnswer',
  'cvGenerationComment', 'legendStartedAt', 'bestCandidateStartedAt', 
  'screeningQuestionsAnswersStartedAt', 'ratingStartedAt', 'coverLetterStartedAt'
];

const otherFields = computed(() => {
  if (!job.value) return [];
  return Object.entries(job.value).filter(([key, value]) => {
    return !handledKeys.includes(key) && value !== null && value !== undefined && value !== '';
  });
});

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
          <h1 v-if="job" class="job-title">
            {{ job.title }}
            <span v-if="job.matchRate" :class="['match-rate-badge', getRateClass(job.matchRate)]">
              ({{ job.matchRate }}%)
            </span>
          </h1>
          <h1 v-else>Loading...</h1>
        </div>
      </section>

      <div v-if="error" class="error-msg">{{ error }}</div>
      <div v-else-if="loading" class="loading-container">
        <div class="loader"></div>
        <p class="loading">Loading vacancy details…</p>
      </div>
      
      <div v-else-if="job" class="job-details-container">
        <!-- Basic Info Grid -->
        <div class="info-card-grid">
          <div class="info-card" v-if="job.companyName">
            <span class="info-label">Company</span>
            <span class="info-value">{{ job.companyName }}</span>
          </div>
          <div class="info-card" v-if="job.domain">
            <span class="info-label">Domain</span>
            <span class="info-value">{{ job.domain }}</span>
          </div>
          <div class="info-card" v-if="job.salary">
            <span class="info-label">Salary</span>
            <span class="info-value">{{ job.salary }}</span>
          </div>
          <div class="info-card" v-if="job.status">
            <span class="info-label">Status</span>
            <span class="info-value status-pill">{{ job.status }}</span>
          </div>
        </div>

        <section class="detail-section" v-if="job.applicationUrl">
          <h3 class="detail-label">Application URL</h3>
          <a :href="job.applicationUrl" target="_blank" rel="noopener" class="detail-link">{{ job.applicationUrl }}</a>
        </section>

        <!-- CV Links & Actions -->
        <section class="detail-section highlight-section cv-section">
          <div class="section-header">
            <h3 class="detail-label">Links for CV</h3>
          </div>
          
          <div class="cv-links-grid">
            <a v-if="job.cvPdfUrl || job.cvUrl" :href="job.cvPdfUrl || job.cvUrl" target="_blank" class="cv-link-action pdf" title="Download PDF">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <span>PDF CV</span>
            </a>
            <a v-if="job.cvHtmlUrl" :href="job.cvHtmlUrl" target="_blank" class="cv-link-action html" title="View HTML">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              <span>HTML CV</span>
            </a>
            <a v-if="job.cvJsonUrl" :href="job.cvJsonUrl" target="_blank" class="cv-link-action json" title="View JSON">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 12 12 16.5 14.6 16.5 19.79"/><polyline points="12 21.19 12 12"/></svg>
              <span>JSON CV</span>
            </a>
            <button @click="generateCv" :disabled="generatingCv" class="cv-link-action regenerate-action" title="Regenerate CV">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              <span>{{ generatingCv ? 'Regen...' : 'Regenerate' }}</span>
            </button>
          </div>

          <div class="field-group" style="margin-top: 1.5rem;">
            <label class="field-label">CV Generation Instructions</label>
            <div v-if="editingField === 'cvGenerationComment'" class="edit-mode">
              <textarea ref="textareaRef" v-model="editValue" @blur="saveField('cvGenerationComment')" class="edit-textarea small"></textarea>
            </div>
            <div v-else @click="startEdit('cvGenerationComment', job.cvGenerationComment)" class="detail-content markdown-body mini-markdown" v-html="renderMarkdown(job.cvGenerationComment || '*No specific instructions.*')"></div>
          </div>
        </section>

        <!-- Generatable Sections -->
        <section class="detail-section highlight-section ai-card">
          <div class="section-header">
            <h3 class="detail-label">Legend</h3>
            <button @click="generateLegend" :disabled="generatingLegend" class="generate-btn">
              {{ generatingLegend ? 'Generating...' : 'Generate' }}
            </button>
          </div>
          <div v-if="editingField === 'legend'" class="edit-mode">
            <textarea ref="textareaRef" v-model="editValue" @blur="saveField('legend')" class="edit-textarea"></textarea>
          </div>
          <div v-else @click="startEdit('legend', job.legend)" class="detail-content markdown-body" v-html="renderMarkdown(job.legend || '*No legend generated yet.*')"></div>
        </section>

        <section class="detail-section highlight-section ai-card">
          <div class="section-header">
            <h3 class="detail-label">Best Candidate</h3>
            <button @click="generateBestCandidate" :disabled="generatingBestCandidate" class="generate-btn">
              {{ generatingBestCandidate ? 'Generating...' : 'Generate' }}
            </button>
          </div>
          <div v-if="editingField === 'bestCandidate'" class="edit-mode">
            <textarea ref="textareaRef" v-model="editValue" @blur="saveField('bestCandidate')" class="edit-textarea"></textarea>
          </div>
          <div v-else @click="startEdit('bestCandidate', job.bestCandidate)" class="detail-content markdown-body" v-html="renderMarkdown(job.bestCandidate || '*No best candidate profile generated yet.*')"></div>
        </section>

        <section class="detail-section highlight-section ai-card">
          <div class="section-header">
            <h3 class="detail-label">Screening Questions Answers</h3>
            <button @click="generateScreeningQuestions" :disabled="generatingScreeningQuestions" class="generate-btn">
              {{ generatingScreeningQuestions ? 'Generating...' : 'Generate' }}
            </button>
          </div>
          <div v-if="editingField === 'screeningQuestionsAnswers'" class="edit-mode">
            <textarea ref="textareaRef" v-model="editValue" @blur="saveField('screeningQuestionsAnswers')" class="edit-textarea"></textarea>
          </div>
          <div v-else @click="startEdit('screeningQuestionsAnswers', job.screeningQuestionsAnswers)" class="detail-content markdown-body" v-html="renderMarkdown(job.screeningQuestionsAnswers || '*No screening questions answers generated yet.*')"></div>
        </section>

        <section class="detail-section highlight-section ai-card">
          <div class="section-header">
            <h3 class="detail-label">Cover Letter</h3>
            <button @click="generateCoverLetter" :disabled="generatingCoverLetter" class="generate-btn">
              {{ generatingCoverLetter ? 'Generating...' : 'Generate' }}
            </button>
          </div>
          <div v-if="editingField === 'coverLetter'" class="edit-mode">
            <textarea ref="textareaRef" v-model="editValue" @blur="saveField('coverLetter')" class="edit-textarea"></textarea>
          </div>
          <div v-else @click="startEdit('coverLetter', job.coverLetter)" class="detail-content markdown-body" v-html="renderMarkdown(job.coverLetter || '*No cover letter generated yet.*')"></div>
        </section>

        <!-- Tech & Skills -->
        <section class="detail-section" v-if="job.topTechAndSkills">
          <h3 class="detail-label">Top Tech & Skills</h3>
          <div class="detail-tags">
            <span v-for="item in (Array.isArray(job.topTechAndSkills) ? job.topTechAndSkills : String(job.topTechAndSkills).split(','))" :key="item" class="tag">{{ item.trim() }}</span>
          </div>
        </section>

        <!-- Copyable Sections -->
        <div class="copy-sections-grid">
          <section v-for="key in ['greetingMessage', 'coverLetter', 'email', 'whyAnswer']" :key="key" 
                   class="detail-section copy-card" v-if="job[key]">
            <div class="section-header">
              <h3 class="detail-label">{{ formatLabel(key) }}</h3>
              <button @click="copyToClipboard(job[key], key)" class="copy-icon-btn" :class="{ copied: copiedField === key }">
                <svg v-if="copiedField !== key" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3dd9b4" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>
            <div v-if="editingField === key" class="edit-mode">
              <textarea ref="textareaRef" v-model="editValue" @blur="saveField(key)" class="edit-textarea small"></textarea>
            </div>
            <div v-else @click="startEdit(key, job[key])" class="detail-content markdown-body mini-markdown" v-html="renderMarkdown(job[key])"></div>
          </section>
        </div>

        <!-- Remaining Fields -->
        <div v-for="[key, value] in otherFields" :key="key">
          <section class="detail-section">
            <h3 class="detail-label">{{ formatLabel(key) }}</h3>
            <div v-if="editingField === key" class="edit-mode">
              <textarea ref="textareaRef" v-model="editValue" @blur="saveField(key)" class="edit-textarea"></textarea>
            </div>
            <div v-else @click="startEdit(key, value)" class="detail-content markdown-body" v-html="renderMarkdown(value)"></div>
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

.page-glow-left { top: -10rem; left: -15rem; background: #3dd9b4; }
.page-glow-right { bottom: 0; right: -15rem; background: #7dd3fc; }

.hero { margin-bottom: 3rem; }
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
.back-link:hover { color: #7dd3fc; transform: translateX(-4px); }

.eyebrow {
  margin: 0 0 0.75rem;
  color: #3dd9b4;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.job-title {
  margin: 0;
  font-size: clamp(2.2rem, 5vw, 3.2rem);
  line-height: 1.2;
  font-weight: 800;
  color: #fff;
}

.match-rate-badge {
  font-size: 0.6em;
  vertical-align: middle;
  margin-left: 0.5rem;
  padding: 0.2rem 0.6rem;
  border-radius: 0.5rem;
  font-weight: 700;
}
.rate-red { color: #fca5a5; background: rgba(248, 113, 113, 0.1); }
.rate-yellow { color: #fde047; background: rgba(253, 224, 71, 0.1); }
.rate-green { color: #3dd9b4; background: rgba(61, 217, 180, 0.1); }

.job-details-container { display: grid; gap: 2rem; }

.info-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1.5rem;
}

.info-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.info-label {
  font-size: 0.7rem;
  font-weight: 800;
  color: #7dd3fc;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
}

.status-pill {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  background: rgba(125, 211, 252, 0.1);
  border-radius: 0.5rem;
  color: #7dd3fc;
  font-size: 0.9rem;
  width: fit-content;
}

.detail-section {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.5rem;
  padding: 2rem;
  backdrop-filter: blur(20px);
}

.highlight-section {
  background: rgba(125, 211, 252, 0.05);
  border: 1px solid rgba(125, 211, 252, 0.2);
}

.cv-section {
  background: rgba(61, 217, 180, 0.03);
  border-color: rgba(61, 217, 180, 0.2);
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
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(61, 217, 180, 0.3);
}
.generate-btn:disabled { opacity: 0.5; cursor: wait; }

.cv-links-grid {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.cv-link-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  min-width: 100px;
  text-decoration: none;
  color: #fff;
  transition: all 0.2s;
}
.cv-link-action:hover {
  background: rgba(255, 255, 255, 0.06);
  transform: translateY(-4px);
  border-color: #7dd3fc;
}
.cv-link-action svg { width: 32px; height: 32px; }
.cv-link-action.pdf svg { color: #fca5a5; }
.cv-link-action.html svg { color: #a78bfa; }
.cv-link-action.json svg { color: #60a5fa; }
.cv-link-action.regenerate-action svg { color: #3dd9b4; }

.regenerate-action {
  cursor: pointer;
  background: rgba(61, 217, 180, 0.05);
}
.regenerate-action:disabled {
  opacity: 0.5;
  cursor: wait;
}

.cv-link-action span { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; }

.detail-content {
  color: var(--text);
  font-size: 1.05rem;
  line-height: 1.7;
  cursor: pointer;
  min-height: 1.5em;
}
.detail-content:hover { background: rgba(255, 255, 255, 0.02); border-radius: 0.5rem; }

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
.edit-textarea.small { min-height: 100px; }

.markdown-body :deep(p) { margin-bottom: 1rem; }
.mini-markdown { font-size: 0.95rem; }

.detail-tags { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.tag {
  background: rgba(61, 217, 180, 0.1);
  border: 1px solid rgba(61, 217, 180, 0.2);
  padding: 0.4rem 1rem;
  border-radius: 999px;
  font-size: 0.9rem;
  color: #3dd9b4;
  font-weight: 600;
}

.copy-sections-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.copy-card { padding: 1.5rem; }
.copy-icon-btn {
  background: transparent;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  color: #7dd3fc;
  border-radius: 0.4rem;
  transition: background 0.2s;
}
.copy-icon-btn:hover { background: rgba(125, 211, 252, 0.1); }
.copy-icon-btn.copied { color: #3dd9b4; }

.detail-link { color: #3dd9b4; text-decoration: none; font-weight: 600; word-break: break-all; }
.detail-link:hover { text-decoration: underline; }

.loader {
  width: 3rem; height: 3rem;
  border: 3px solid rgba(61, 217, 180, 0.1);
  border-top-color: #3dd9b4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.error-msg {
  color: #fca5a5; background: rgba(248, 113, 113, 0.1);
  padding: 1.5rem; border-radius: 1rem; text-align: center;
}
</style>
