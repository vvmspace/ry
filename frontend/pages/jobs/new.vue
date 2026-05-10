<script setup lang="ts">
const config = useRuntimeConfig();
const apiBase = ref(
  typeof localStorage !== "undefined"
    ? (localStorage.getItem("apiBase") || config.public.apiBase)
    : config.public.apiBase
);

const form = reactive({
  applicationUrl: "",
  vacancyText: "",
  title: "",
  companyName: "",
  salary: "",
  topTechAndSkills: "",
  status: "saved",
  cvHtmlUrl: "",
  cvGenerationComment: "",
});

const loading = ref(false);
const error = ref("");
const success = ref(false);

const STATUSES = ["pending", "saved", "generated", "started", "applied", "screening", "interview", "cancelled", "error", "expired"];

async function handleSubmit() {
  loading.value = true;
  error.value = "";
  success.value = false;

  try {
    const base = apiBase.value.replace(/\/$/, "");
    const res = await fetch(`${base}/api/v1/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const job = await res.json();
    success.value = true;
    
    // Redirect after a short delay
    setTimeout(() => {
      navigateTo(`/jobs/${job._id}`);
    }, 1500);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to create job";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="page-shell">
    <div class="page-glow page-glow-left" />
    <div class="page-glow page-glow-right" />

    <main class="app">
      <header class="page-header">
        <NuxtLink to="/" class="back-link">
          <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
            <path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Back to list
        </NuxtLink>
        <h1>New Job</h1>
        <p class="subtitle">Add a vacancy manually to the tracker.</p>
      </header>

      <form @submit.prevent="handleSubmit" class="job-form">
        <div v-if="error" class="error-msg">{{ error }}</div>
        <div v-if="success" class="success-msg">Job created successfully! Redirecting...</div>

        <div class="form-grid">
          <div class="form-group full-width">
            <label for="applicationUrl">Application URL</label>
            <input
              id="applicationUrl"
              v-model="form.applicationUrl"
              type="url"
              placeholder="https://jobs.lever.co/..."
              required
            />
          </div>

          <div class="form-group">
            <label for="title">Job Title</label>
            <input
              id="title"
              v-model="form.title"
              type="text"
              placeholder="Senior Software Engineer"
            />
          </div>

          <div class="form-group">
            <label for="companyName">Company Name</label>
            <input
              id="companyName"
              v-model="form.companyName"
              type="text"
              placeholder="Acme Corp"
            />
          </div>

          <div class="form-group">
            <label for="salary">Salary</label>
            <input
              id="salary"
              v-model="form.salary"
              type="text"
              placeholder="$120k - $160k"
            />
          </div>

          <div class="form-group">
            <label for="status">Initial Status</label>
            <select id="status" v-model="form.status">
              <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>

          <div class="form-group full-width">
            <label for="topTechAndSkills">Top Tech & Skills</label>
            <input
              id="topTechAndSkills"
              v-model="form.topTechAndSkills"
              type="text"
              placeholder="Node.js, TypeScript, AWS, React"
            />
          </div>

          <div class="form-group full-width">
            <label for="vacancyText">Vacancy Text / Description</label>
            <textarea
              id="vacancyText"
              v-model="form.vacancyText"
              rows="10"
              placeholder="Paste the job description here..."
            ></textarea>
          </div>

          <div class="form-group full-width">
            <label for="cvHtmlUrl">CV HTML URL (Optional)</label>
            <input
              id="cvHtmlUrl"
              v-model="form.cvHtmlUrl"
              type="url"
              placeholder="https://..."
            />
          </div>

          <div class="form-group full-width">
            <label for="cvGenerationComment">CV Generation Instructions / Comment</label>
            <textarea
              id="cvGenerationComment"
              v-model="form.cvGenerationComment"
              rows="3"
              placeholder="e.g. Focus on my Rust experience and AI agent projects..."
            ></textarea>
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="submit-btn" :disabled="loading">
            <span v-if="loading">Creating...</span>
            <span v-else>Create Job</span>
          </button>
        </div>
      </form>
    </main>
  </div>
</template>

<style scoped>
.page-shell {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  padding: 2rem 1rem;
}

.page-glow {
  position: absolute;
  width: 30rem;
  height: 30rem;
  border-radius: 999px;
  filter: blur(100px);
  opacity: 0.15;
  pointer-events: none;
  z-index: 0;
}

.page-glow-left {
  top: -10rem;
  left: -15rem;
  background: #3dd9b4;
}

.page-glow-right {
  bottom: -10rem;
  right: -15rem;
  background: #ff7a59;
}

.app {
  position: relative;
  z-index: 1;
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 2.5rem;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #7dd3fc;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 1rem;
  transition: opacity 0.2s;
}

.back-link:hover {
  opacity: 0.8;
}

h1 {
  margin: 0 0 0.5rem;
  font-size: 2.5rem;
  background: linear-gradient(135deg, #fff 0%, #7dd3fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  color: var(--text-muted);
  font-size: 1.1rem;
}

.job-form {
  background: rgba(13, 17, 23, 0.7);
  border: 1px solid rgba(125, 211, 252, 0.15);
  border-radius: 1.5rem;
  padding: 2rem;
  backdrop-filter: blur(16px);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.full-width {
  grid-column: span 2;
}

label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #7dd3fc;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

input, select, textarea {
  background: rgba(16, 18, 24, 0.9);
  border: 1px solid rgba(125, 211, 252, 0.1);
  border-radius: 0.75rem;
  padding: 0.8rem 1rem;
  color: var(--text);
  font-size: 1rem;
  transition: all 0.2s;
}

input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: #3dd9b4;
  box-shadow: 0 0 0 2px rgba(61, 217, 180, 0.1);
}

textarea {
  resize: vertical;
  min-height: 150px;
}

.form-actions {
  margin-top: 2rem;
  display: flex;
  justify-content: flex-end;
}

.submit-btn {
  padding: 1rem 2.5rem;
  background: linear-gradient(135deg, #3dd9b4, #7dd3fc);
  color: #07111b;
  border: none;
  border-radius: 999px;
  font-weight: 700;
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(61, 217, 180, 0.2);
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(61, 217, 180, 0.3);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-msg {
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.3);
  color: #fca5a5;
  padding: 1rem;
  border-radius: 0.75rem;
  margin-bottom: 1.5rem;
}

.success-msg {
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.3);
  color: #86efac;
  padding: 1rem;
  border-radius: 0.75rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .full-width {
    grid-column: span 1;
  }
  .job-form {
    padding: 1.5rem;
  }
}
</style>
