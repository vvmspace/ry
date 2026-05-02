require('dotenv').config();

const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const { connectMongo } = require('../db/mongoose');
const JobPage = require('../models/jobPage');
const { allocateBrowser, releaseBrowser } = require('../libs/state');
const { b2b } = require('../../constants/text.constants');

const QUESTIONS_PATH = path.resolve(process.cwd(), 'questions.json');
const ANSWERS_PATH = path.resolve(process.cwd(), 'answers.json');
const TMP_DIR = path.resolve(process.cwd(), 'tmp');

const {
  FIRST_NAME = '',
  LAST_NAME = '',
  PHONE = '',
  LINKEDIN_PROFILE = '',
  GITHUB_PROFILE = '',
} = process.env;

const log = (msg) => console.log(`[ashby] ${msg}`);
const step = (n, msg) => console.log(`\x1b[36m[step ${n}]\x1b[0m ${msg}`);

// ── questions.json helpers ────────────────────────────────────────────────────

function readQuestions() {
  try {
    return JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveQuestions(q) {
  fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(q, null, 2), 'utf8');
}

function addQuestion(text) {
  const q = readQuestions();
  q[text] = (q[text] || 0) + 1;
  saveQuestions(q);
}

function readAnswers() {
  try {
    return JSON.parse(fs.readFileSync(ANSWERS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

// Find answer from answers.json by label (case-insensitive substring match)
function findAnswer(labelText) {
  const answers = readAnswers();
  const l = labelText.toLowerCase().replace(/\*$/, '').trim();
  for (const [question, answer] of Object.entries(answers)) {
    if (l.includes(question.toLowerCase()) || question.toLowerCase().includes(l)) {
      return answer;
    }
  }
  return null;
}

// ── field-matching helpers ────────────────────────────────────────────────────

function labelMatches(label, ...keywords) {
  const l = label.toLowerCase();
  return keywords.every(k => l.includes(k.toLowerCase()));
}

// ── next-monday helper ────────────────────────────────────────────────────────

function nextMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// ── salary helpers ────────────────────────────────────────────────────────────

function salaryDigitsOnly(salary) {
  if (!salary) return '80000-150000';
  const digits = salary.replace(/[^\d\-]/g, '').replace(/--+/g, '-').replace(/^-|-$/g, '');
  return digits || '80000-150000';
}

// ── CV download ───────────────────────────────────────────────────────────────

async function downloadCvToTmp(cvUrl) {
  if (!cvUrl) return null;
  log(`Downloading CV from ${cvUrl}`);
  const res = await fetch(cvUrl);
  if (!res.ok) { log(`CV download failed: HTTP ${res.status}`); return null; }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  const filePath = path.join(TMP_DIR, 'cv.pdf');
  fs.writeFileSync(filePath, buf);
  log(`CV saved to ${filePath}`);
  return filePath;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function runAshbyApplyWorker() {
  console.log('\x1b[36m\x1b[1m📋  ASHBY APPLY WORKER\x1b[0m');
  const timeStart = Date.now();

  step(0, 'Connecting to MongoDB...');
  await connectMongo();
  log('MongoDB connected.');

  // 1. Pick a random eligible job
  step(1, 'Fetching eligible generated ashby jobs...');
  const jobs = await JobPage.find({
    status: 'generated',
    domain: /jobs\.ashbyhq\.com/i,
    $or: [{ manual: false }, { manual: null }, { manual: { $exists: false } }],
  });
  log(`Found ${jobs.length} eligible job(s).`);

  if (!jobs.length) {
    log('No eligible generated ashby jobs found. Exiting.');
    await mongoose.disconnect();
    return;
  }

  const job = jobs[Math.floor(Math.random() * jobs.length)];
  log(`Selected job: "${job.title}" | ${job.applicationUrl || job.url}`);

  const headless = process.env.ASHBY_HEADLESS !== 'false';
  log(`Launching browser (headless=${headless})...`);

  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const viewport = { width: randInt(1040, 1340), height: randInt(760, 900) };
  log(`Viewport: ${viewport.width}×${viewport.height}`);

  if (!allocateBrowser()) {
    log("Browser in use, skipping...");
    await mongoose.disconnect();
    return;
  }

  const browser = await puppeteer.launch({
    userDataDir: process.env.USER_DIR || 'userdir',
    headless,
    defaultViewport: viewport,
    executablePath: process.env.CHROME_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=' + viewport.width + ',' + viewport.height,
    ],
  });
  log('Browser launched.');

  try {
    const page = (await browser.pages())[0] || (await browser.newPage());

    // Stealth: patch navigator.webdriver and user-agent
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {} };
    });
    const ua = await browser.userAgent();
    await page.setUserAgent(ua.replace('HeadlessChrome', 'Chrome'));

    // 2. Navigate and click "Application" tab
    step(2, 'Navigating to application URL...');
    const targetUrl = job.applicationUrl || job.url;
    log(`→ ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    log('Page loaded.');

    // Smooth scroll bottom → top to trigger lazy loading
    log('Scrolling to bottom (smooth)...');
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await new Promise(r => setTimeout(r, 800 + Math.floor(Math.random() * 600)));
    log('Scrolling to top (smooth)...');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await new Promise(r => setTimeout(r, 400 + Math.floor(Math.random() * 400)));

    async function clickApplicationTab() {
      const tab = await page.$('a[href*="/application"], [role="tab"][id*="application"], .ashby-job-posting-right-pane-application-tab');
      if (tab) {
        log('Found "Application" tab, clicking...');
        await tab.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        log('Navigated to application form.');
        return true;
      }
      return false;
    }

    await clickApplicationTab();

    // 3. Wait for form; if no inputs found — wait 5s and click tab again (once)
    step(3, 'Waiting for form to load...');
    const formSel = 'input:not([type="hidden"]), [class*="fieldEntry"]';
    const formFound = await page.waitForSelector(formSel, { timeout: 10000 }).catch(() => null);
    if (!formFound) {
      log('No inputs found, waiting 5s and retrying tab click...');
      await new Promise(r => setTimeout(r, 5000));
      await clickApplicationTab();
      await page.waitForSelector(formSel, { timeout: 10000 }).catch(() => {});
    }
    log('Form ready.');

    // 5. Check "not found"
    step(5, 'Checking for "not found" page...');
    const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
    if (bodyText.includes('not found') || bodyText.includes('404') || bodyText.includes('job not found')) {
      log('Job page not found. Setting status to expired.');
      job.status = 'expired';
      await job.save();
      log('Job saved as expired. Exiting.');
      return;
    }
    log('Page looks valid, continuing.');

    // 4. Collect and log all fields
    step(4, 'Collecting form fields...');
    const fields = await page.evaluate(() => {
      const results = [];

      // Helper: check if a label is "required"
      function isLabelRequired(label, input) {
        const labelText = label.innerText.trim();
        const hasRequiredAttr = !!(input && input.required);
        const labelEndsWithStar = labelText.endsWith('*');
        const labelContainsStarSpan = Array.from(label.querySelectorAll('*')).some(
          el => el.children.length === 0 && el.textContent.trim() === '*'
        );
        return hasRequiredAttr || labelEndsWithStar || labelContainsStarSpan;
      }

      // 1. Collect radio groups via fieldset > legend
      document.querySelectorAll('fieldset').forEach(fieldset => {
        const legend = fieldset.querySelector('legend');
        if (!legend) return;
        const radios = Array.from(fieldset.querySelectorAll('input[type="radio"]'));
        const checkboxes = Array.from(fieldset.querySelectorAll('input[type="checkbox"]'));
        if (radios.length === 0 && checkboxes.length === 0) return;

        const labelText = legend.innerText.trim();
        const type = radios.length > 0 ? 'radio' : 'checkbox';
        const required = fieldset.querySelector('[required]') !== null
          || labelText.endsWith('*')
          || Array.from(legend.querySelectorAll('*')).some(el => el.children.length === 0 && el.textContent.trim() === '*');

        // Collect option labels
        const options = [];
        const inputs = radios.length > 0 ? radios : checkboxes;
        inputs.forEach(inp => {
          const lbl = inp.id ? document.querySelector(`label[for="${inp.id}"]`) : inp.closest('label');
          options.push({ value: inp.value, labelText: lbl ? lbl.innerText.trim() : inp.value, inputId: inp.id });
        });

        results.push({ labelText, required, inputType: type, inputId: inputs[0] ? inputs[0].name || inputs[0].id : '', hasInput: true, options, isGroup: true });
      });

      // 2. Collect regular labels (skip those inside fieldsets already collected)
      document.querySelectorAll('label').forEach(label => {
        if (label.closest('fieldset')) return; // handled above
        const forAttr = label.getAttribute('for');
        let input = forAttr ? document.getElementById(forAttr) : null;
        if (!input) input = label.querySelector('input, select, textarea');
        if (!input) {
          const next = label.nextElementSibling;
          if (next) input = next.querySelector('input, select, textarea') || (next.matches('input,select,textarea') ? next : null);
        }
        const labelText = label.innerText.trim();
        const required = isLabelRequired(label, input);
        const inputType = input ? (input.tagName.toLowerCase() === 'select' ? 'select' : input.type || input.tagName.toLowerCase()) : 'unknown';
        const inputId = input ? (input.id || input.name || '') : '';
        results.push({ labelText, required, inputType, inputId, hasInput: !!input });
      });

      return results;
    });

    console.log('\n--- FORM FIELDS ---');
    fields.forEach(f => {
      const req = f.required ? '\x1b[31m[REQUIRED]\x1b[0m' : '\x1b[90m[optional]\x1b[0m';
      const opts = f.options ? ` [${f.options.map(o => o.labelText).join(' | ')}]` : '';
      console.log(`  ${req} "${f.labelText}" (${f.inputType}) id=${f.inputId}${opts}`);
    });
    console.log(`-------------------\n  Total: ${fields.length} field(s)\n`);

    // 6. Check we can fill all required fields
    step(6, 'Checking all required fields are fillable...');
    const knownPatterns = [
      ['legal name', 'name', 'full name'],
      ['first name', 'legal first name'],
      ['last name', 'legal last name'],
      ['preferred name', 'preferred first name', 'preferred last name'],
      ['pronouns'],
      ['e-mail', 'email'],
      ['phone'],
      ['resume', 'cv'],
      ['github', 'gitlab'],
      ['linkedin'],
      ['cover letter'],
      ['portfolio'],
      ['location'],
      ['salary'],
      ['when', 'start'],
      ['notice', 'period'],
      ['why'],
    ];

    function canFillLabel(labelText) {
      const l = labelText.toLowerCase().replace(/\*$/, '').trim();
      for (const group of knownPatterns) {
        if (group.some(p => l.includes(p))) return true;
      }
      return false;
    }

    const unknownRequired = fields.filter(f => {
      if (!f.required) return false;
      // radio/checkbox groups: always attempt (click first option or answers.json)
      if (f.inputType === 'radio' || f.inputType === 'checkbox') return false;
      return !canFillLabel(f.labelText) && !findAnswer(f.labelText);
    });
    if (unknownRequired.length > 0) {
      console.error('[ashby] Additional required fields found:', unknownRequired.map(f => f.labelText));
      job.manual = true;
      job.additional_questions = unknownRequired.map(f => f.labelText);
      await job.save();
      log('Job marked as manual. Updating questions.json...');
      unknownRequired.forEach(f => addQuestion(f.labelText));
      log('questions.json updated. Exiting.');
      return;
    }
    log('All required fields are known, proceeding to fill.');

    // Download CV
    step('CV', 'Downloading CV file...');
    const cvLocalPath = await downloadCvToTmp(job.cvUrl).catch(e => { log(`CV download error: ${e.message}`); return null; });

    // 7. Fill visible text fields
    step(7, 'Filling form fields...');
    const SKIP_TYPES = ['hidden', 'submit', 'button', 'image', 'reset'];
    let filledCount = 0;
    for (const field of fields) {
      const label = field.labelText.toLowerCase().replace(/\*$/, '').trim();
      if (SKIP_TYPES.includes(field.inputType)) {
        log(`  skip non-text type: "${field.labelText}" (${field.inputType})`);
        continue;
      }
      const isAlways = field.labelText.includes('(always)')
        || labelMatches(label, 'phone')
        || labelMatches(label, 'linkedin')
        || labelMatches(label, 'location');
      if (!field.required && !isAlways) {
        log(`  skip optional: "${field.labelText}"`);
        continue;
      }
      log(`  filling: "${field.labelText}" (${field.inputType})`);
      try {
        await fillField(page, field, label, job, cvLocalPath);
        log(`  ✓ filled: "${field.labelText}"`);
        filledCount++;
      } catch (err) {
        console.error(`[ashby]   ✗ failed to fill "${field.labelText}": ${err.message}`);
      }
      const pause = 1000 + Math.floor(Math.random() * 4000); // rand(1,5)s
      log(`  pause ${pause}ms`);
      await new Promise(r => setTimeout(r, pause));
    }
    log(`All fields processed. Filled: ${filledCount}`);

    // 8. Find submit button and log confirmation
    step(8, 'Looking for submit button...');
    const submitBtn = await page.$('button.ashby-application-form-submit-button');
    if (submitBtn) {
      const btnText = await page.evaluate(el => el.innerText.trim(), submitBtn);
      log(`Submit button found: "${btnText}"`);
    } else {
      log('Submit button (button.ashby-application-form-submit-button) NOT found.');
    }

    // 9. Wait: 60s - elapsed + fields*2s + rand(0,15s)
    const elapsed = Date.now() - timeStart;
    const waitMs = Math.max(0, 60000 - elapsed) + filledCount * 2000 + Math.floor(Math.random() * 15000);
    step(9, `Waiting ${(waitMs / 1000).toFixed(1)}s (elapsed=${(elapsed / 1000).toFixed(1)}s, fields=${filledCount})...`);
    await new Promise(r => setTimeout(r, waitMs));

    // 10. Screenshot before submit
    step(10, 'Taking before_submit screenshot...');
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    const beforeDir = path.join(TMP_DIR, 'before_submit');
    if (!fs.existsSync(beforeDir)) fs.mkdirSync(beforeDir, { recursive: true });
    await page.screenshot({ path: path.join(beforeDir, `ashby_${job._id}_${Date.now()}.png`), fullPage: true });
    await page.screenshot({ path: path.join(TMP_DIR, 'before_submit.png'), fullPage: true });
    log('before_submit screenshot saved.');

    // 11. Save rendered HTML and click submit
    step(11, 'Saving rendered HTML to ./tmp/last.html...');
    const renderedHtml = await page.content();
    fs.writeFileSync(path.join(TMP_DIR, 'last.html'), renderedHtml, 'utf8');
    log('HTML saved.');
    step(11, 'Clicking submit button...');
    if (submitBtn) {
      // Move mouse to button naturally before clicking
      const box = await submitBtn.boundingBox();
      if (box) {
        const x = box.x + box.width * (0.3 + Math.random() * 0.4);
        const y = box.y + box.height * (0.3 + Math.random() * 0.4);
        await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 10) });
        await new Promise(r => setTimeout(r, 200 + Math.floor(Math.random() * 300)));
      }
      await submitBtn.click();
      log('Clicked submit.');
    } else {
      log('No submit button to click.');
    }

    // 12. Wait 10s after submit (reCAPTCHA v3 may delay response)
    step(12, 'Waiting 10s after submit...');
    await new Promise(r => setTimeout(r, 10000));

    // 13. Check for success and screenshot
    step(13, 'Checking for success container...');
    const isSuccess = await page.$('.ashby-application-form-success-container').then(el => !!el);

    const screenshotSubdir = isSuccess ? 'success' : 'error';
    const screenshotDir = path.join(TMP_DIR, screenshotSubdir);
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, `ashby_${job._id}_${Date.now()}.png`), fullPage: true });
    await page.screenshot({ path: path.join(TMP_DIR, `${screenshotSubdir}.png`), fullPage: true });
    log(`Screenshot saved to ./tmp/${screenshotSubdir}/ and ./tmp/${screenshotSubdir}.png`);

    // 14. Update job status
    if (isSuccess) {
      log('Success detected — setting status: applied');
      job.status = 'applied';
    } else {
      log('No success container found — setting manual: true');
      job.manual = true;
    }
    await job.save();

    log('Done.');

  } finally {
    log('Closing browser...');
    if (typeof browser !== 'undefined') {
      await browser.close().catch(() => {});
      releaseBrowser();
    }
    log('Disconnecting from MongoDB...');
    await mongoose.disconnect();
    log('Exited cleanly.');
  }
}

// ── field filler ─────────────────────────────────────────────────────────────

async function fillField(page, field, label, job, cvLocalPath) {
  const { inputId, labelText } = field;

  // Find the ElementHandle via label text to avoid invalid CSS selectors (UUID ids, etc.)
  async function findInputHandle() {
    // 1. Try getElementById (safe, works with any id)
    if (inputId) {
      const handle = await page.evaluateHandle((id) => document.getElementById(id), inputId);
      const el = handle.asElement();
      if (el) return el;
    }
    // 2. Find label by text, then get associated input
    return page.evaluateHandle((labelTxt) => {
      for (const label of document.querySelectorAll('label')) {
        if (label.innerText.trim().replace(/\*$/, '').trim() === labelTxt.replace(/\*$/, '').trim()) {
          const forAttr = label.getAttribute('for');
          if (forAttr) {
            const el = document.getElementById(forAttr);
            if (el) return el;
          }
          const el = label.querySelector('input, select, textarea');
          if (el) return el;
          const next = label.nextElementSibling;
          if (next) {
            const nested = next.querySelector('input, select, textarea');
            if (nested) return nested;
            if (next.matches('input, select, textarea')) return next;
          }
        }
      }
      return null;
    }, labelText);
  }

  async function typeInto(value) {
    const handle = await findInputHandle();
    const el = handle && handle.asElement ? handle.asElement() : null;
    if (!el) { log(`  no input element found for "${labelText}"`); return; }
    try {
      const tag = await page.evaluate(n => n.tagName.toLowerCase(), el);
      await el.focus();
      // Select all existing content and replace
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      const charDelay = 40 + Math.floor(Math.random() * 80); // rand 40-120ms per char
      if (tag === 'textarea') {
        // For textarea use keyboard.type to handle newlines correctly
        await page.keyboard.type(String(value), { delay: charDelay });
      } else {
        await el.type(String(value), { delay: charDelay });
      }
    } catch {
      await page.evaluate((node, val) => {
        node.focus();
        node.value = val;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      }, el, String(value));
    }
  }

  // kept for resume which needs getElementById fallback
  void 0; // sel removed

  if ((labelMatches(label, 'legal name') || labelMatches(label, 'full name') ||
      (label === 'name' && !labelMatches(label, 'first') && !labelMatches(label, 'last') && !labelMatches(label, 'company'))) &&
      !labelMatches(label, 'first name') && !labelMatches(label, 'last name')) {
    await typeInto(`${FIRST_NAME} ${LAST_NAME}`);
    return;
  }

  if (labelMatches(label, 'first name') || labelMatches(label, 'legal first')) {
    await typeInto(FIRST_NAME);
    return;
  }

  if (labelMatches(label, 'last name') || labelMatches(label, 'legal last')) {
    await typeInto(LAST_NAME);
    return;
  }

  if (labelMatches(label, 'preferred name') || labelMatches(label, 'preferred first') || labelMatches(label, 'preferred last')) {
    await typeInto(FIRST_NAME);
    return;
  }

  if (labelMatches(label, 'pronouns')) {
    const handle = await findInputHandle();
    const el = handle && handle.asElement ? handle.asElement() : null;
    if (el) {
      const tag = await page.evaluate(n => n.tagName.toLowerCase(), el);
      if (tag === 'select') {
        await page.evaluate(n => {
          const opt = Array.from(n.options).find(o => o.text.toLowerCase().includes('he'));
          if (opt) { n.value = opt.value; n.dispatchEvent(new Event('change', { bubbles: true })); }
        }, el);
      } else {
        await el.focus();
        await el.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await el.type('He/Him', { delay: 40 + Math.floor(Math.random() * 80) });
      }
    }
    return;
  }

  if (labelMatches(label, 'email') || labelMatches(label, 'e-mail')) {
    await typeInto(job.email || '');
    return;
  }

  if (labelMatches(label, 'phone')) {
    await typeInto(PHONE);
    return;
  }

  if (labelMatches(label, 'resume') || labelMatches(label, 'cv')) {
    if (!cvLocalPath) { log('No CV file available, skipping resume field.'); return; }
    try {
      // Use getElementById to safely get the file input
      const fileInput = await page.evaluateHandle(
        (id) => id ? document.getElementById(id) : document.querySelector('input[type="file"][id*="resume"], input[type="file"][id*="systemfield_resume"]'),
        inputId || null
      ).then(h => h.asElement());
      if (fileInput) {
        await fileInput.uploadFile(cvLocalPath);
        log('CV uploaded via file input.');
      } else {
        log('No file input found for resume.');
      }
    } catch (e) {
      console.error('[ashby] Resume upload failed:', e.message);
    }
    return;
  }

  if (labelMatches(label, 'github') || labelMatches(label, 'gitlab')) {
    await typeInto(GITHUB_PROFILE);
    return;
  }

  if (labelMatches(label, 'linkedin')) {
    await typeInto(LINKEDIN_PROFILE);
    return;
  }

  if (labelMatches(label, 'cover letter') || labelMatches(label, 'additional information')) {
    await typeInto(`${job.greetingMessage || ''}\n\n${b2b}`);
    return;
  }

  if (labelMatches(label, 'portfolio')) {
    await typeInto(GITHUB_PROFILE);
    return;
  }

  if (labelMatches(label, 'location')) {
    const handle = await findInputHandle();
    const el = handle && handle.asElement ? handle.asElement() : null;
    if (!el) { log(`  no input element found for "${labelText}"`); return; }
    try {
      await el.focus();
      await el.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await el.type('Yerevan', { delay: 40 + Math.floor(Math.random() * 80) });
      // Wait for autocomplete suggestions
      await new Promise(r => setTimeout(r, 1500));
      // Try clicking the first suggestion
      const suggestion = await page.$('[role="option"], [class*="suggestion"], [class*="autocomplete"] li, [class*="dropdown"] li');
      if (suggestion) {
        await suggestion.click();
        log('  location: clicked suggestion for "Yerevan"');
      } else {
        // Fallback: clear and type "Armenia"
        await el.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await el.type('Armenia', { delay: 40 + Math.floor(Math.random() * 80) });
        await new Promise(r => setTimeout(r, 1500));
        const suggestion2 = await page.$('[role="option"], [class*="suggestion"], [class*="autocomplete"] li, [class*="dropdown"] li');
        if (suggestion2) {
          await suggestion2.click();
          log('  location: clicked suggestion for "Armenia"');
        } else {
          log('  location: no suggestion found, left typed value');
        }
      }
    } catch (e) {
      log(`  location fallback error: ${e.message}`);
    }
    return;
  }

  if (labelMatches(label, 'salary') && labelMatches(label, 'daily')) {
    await typeInto(field.inputType === 'number' ? '300' : '300$');
    return;
  }

  if (labelMatches(label, 'salary') && labelMatches(label, 'year') && labelMatches(label, 'range')) {
    await typeInto(salaryDigitsOnly(job.salary));
    return;
  }

  if (labelMatches(label, 'salary') && labelMatches(label, 'month') && labelMatches(label, 'range')) {
    await typeInto('7000-15000$');
    return;
  }

  if (labelMatches(label, 'salary')) {
    await typeInto(`${salaryDigitsOnly(job.salary)} / y`);
    return;
  }

  if (labelMatches(label, 'when') && labelMatches(label, 'start')) {
    await typeInto(field.inputType === 'date' ? nextMonday() : '0-3 weeks');
    return;
  }

  if (labelMatches(label, 'notice') && labelMatches(label, 'period')) {
    await typeInto('0-3 weeks');
    return;
  }

  if (labelMatches(label, 'why')) {
    await typeInto(job.whyAnswer || '');
    return;
  }

  // ── radio group ───────────────────────────────────────────────────────────
  if (field.inputType === 'radio' && field.options && field.options.length > 0) {
    // Try to match by known answers or pick smart defaults
    const savedAnswer = findAnswer(labelText);
    const options = field.options;

    // Find best matching option
    let targetOption = null;
    if (savedAnswer) {
      targetOption = options.find(o => o.labelText.toLowerCase().includes(savedAnswer.toLowerCase()))
        || options.find(o => savedAnswer.toLowerCase().includes(o.labelText.toLowerCase()));
    }
    // Smart defaults for common radio groups
    if (!targetOption) {
      const l = label.toLowerCase();
      if (l.includes('pronoun')) {
        targetOption = options.find(o => o.labelText.toLowerCase().includes('he'));
      } else if (l.includes('authorized') || l.includes('eligible') || l.includes('legally') || l.includes('work')) {
        targetOption = options.find(o => /\byes\b/i.test(o.labelText));
      } else if (l.includes('sponsor') || l.includes('visa')) {
        targetOption = options.find(o => /\bno\b/i.test(o.labelText));
      } else if (l.includes('veteran') || l.includes('disability') || l.includes('race') || l.includes('gender') || l.includes('ethnicity')) {
        // EEOC: prefer "I don't wish to answer" / "Decline" / "Prefer not"
        targetOption = options.find(o => /decline|prefer not|don.t wish|not to answer/i.test(o.labelText))
          || options.find(o => /no|none/i.test(o.labelText));
      }
    }
    // Fallback: first option
    if (!targetOption) targetOption = options[0];

    log(`  radio "${labelText}": clicking option "${targetOption.labelText}"`);
    try {
      await page.evaluate((optId) => {
        const el = document.getElementById(optId);
        if (el) { el.click(); el.dispatchEvent(new Event('change', { bubbles: true })); }
      }, targetOption.inputId);
    } catch (e) {
      log(`  radio click failed: ${e.message}`);
    }
    return;
  }

  // ── checkbox ──────────────────────────────────────────────────────────────
  if (field.inputType === 'checkbox') {
    // For checkbox groups (fieldset), check all or first; for single consent — check it
    const options = field.options;
    if (options && options.length > 0) {
      // Single consent/agreement checkbox — just check the first one
      const savedAnswer = findAnswer(labelText);
      const toCheck = savedAnswer
        ? options.filter(o => o.labelText.toLowerCase().includes(savedAnswer.toLowerCase()))
        : [options[0]];
      for (const opt of toCheck) {
        log(`  checkbox "${labelText}": checking "${opt.labelText}"`);
        await page.evaluate((optId) => {
          const el = document.getElementById(optId);
          if (el && !el.checked) { el.click(); el.dispatchEvent(new Event('change', { bubbles: true })); }
        }, opt.inputId);
      }
    }
    return;
  }

  // Fallback: check answers.json for a matching answer
  const savedAnswer = findAnswer(labelText);
  if (savedAnswer) {
    log(`  using answers.json for "${labelText}": "${savedAnswer}"`);
    await typeInto(savedAnswer);
    return;
  }
}

// ── entry point ───────────────────────────────────────────────────────────────

if (require.main === module) {
  const t0 = require('perf_hooks').performance.now();
  console.log(`Job started at: ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date())}`);
  runAshbyApplyWorker().catch(err => {
    console.error(err);
    process.exitCode = 1;
  }).finally(() => {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date());
    console.log(`Job completed at: ${time} (Duration: ${((require('perf_hooks').performance.now() - t0) / 1000).toFixed(2)}s)`);
  });
}

module.exports = { runAshbyApplyWorker };
