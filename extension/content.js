const LINKEDIN_LABEL_RE = /linkedin/i;
const PHONE_LABEL_RE = /telephone|phone/i;
const PORTFOLIO_LABEL_RE = /portfolio|site|github/i;
const SALARY_LABEL_RE = /salary|expectations|compensation/i;

const FILLED_FLAG = "autofillApplied";
const INITIAL_FILL_DELAY_MS = 2000;
const RETRY_DELAYS_MS = [0, 300, 1000, 2000, 4000];
const LOG_PREFIX = "[remoteyeah-autofill]";
const API_URL = "https://tma.kingofthehill.pro/api/v1/ai/ask";

const defaultValues = {
  linkedIn: "https://www.linkedin.com/in/vladimir-myagdeev-b03322160/",
  phone: "+37498330380",
  portfolio: "https://github.com/vvmspace/theproject",
  salaryExpectations: "84000-132000$/y"
};

let aiAnswers = {};
let applicationUrl = "";

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function dispatchInputEvents(input) {
  log("dispatching input/change events", { id: input.id, name: input.name });
  input.focus();
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.blur();
}

function setNativeValue(input, value) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
}

function fillInput(input, value) {
  if (!input || !value || input.dataset[FILLED_FLAG] === "true") {
    // log("skipping fill", {
    //   hasInput: Boolean(input),
    //   hasValue: Boolean(value),
    //   alreadyFilled: input?.dataset?.[FILLED_FLAG] === "true"
    // });
    return;
  }

  if (input.value && input.value.trim().length > 0) {
    // log("input already has value, skipping", {
    //   id: input.id,
    //   name: input.name,
    //   value: input.value
    // });
    return;
  }

  log("filling input", { id: input.id, name: input.name, value });
  setNativeValue(input, value);
  dispatchInputEvents(input);

  if ((input.value || "").trim() === value) {
    input.dataset[FILLED_FLAG] = "true";
    log("fill confirmed", { id: input.id, name: input.name });
  } else {
    log("fill did not stick", {
      id: input.id,
      name: input.name,
      currentValue: input.value
    });
  }
}

function findInputByLabel(label) {
  const htmlFor = label.getAttribute("for");
  log("resolving input for label", {
    text: (label.textContent || "").trim(),
    htmlFor
  });

  if (htmlFor) {
    const inputById = document.getElementById(htmlFor);
    log("lookup by for/id result", { htmlFor, found: Boolean(inputById) });
    return inputById;
  }

  const fieldEntry = label.closest(".ashby-application-form-field-entry");
  const scopedInput =
    fieldEntry?.querySelector("input, textarea") ||
    label.parentElement?.querySelector("input, textarea") ||
    label.querySelector("input, textarea");
  if (scopedInput) {
    log("scoped lookup result", {
      found: true,
      tagName: scopedInput.tagName,
      type: scopedInput.type || null
    });
    return scopedInput;
  }

  const nestedInput =
    label.querySelector("input, textarea") ||
    label.parentElement?.querySelector("input, textarea");
  log("fallback nested lookup result", { found: Boolean(nestedInput) });
  return nestedInput;
}

function autofillFields(customValues = {}, useDefaults = false) {
  const labels = document.querySelectorAll("label");
  log("scan started", { labelsCount: labels.length, useDefaults });

  const linkedinUrl = customValues.linkedinUrl || defaultValues.linkedIn;
  const rules = [
    { re: LINKEDIN_LABEL_RE, value: linkedinUrl, key: "linkedIn" },
    { re: PHONE_LABEL_RE, value: defaultValues.phone, key: "phone" },
    { re: PORTFOLIO_LABEL_RE, value: defaultValues.portfolio, key: "portfolio" },
    { re: SALARY_LABEL_RE, value: defaultValues.salaryExpectations, key: "salaryExpectations" }
  ];

  for (const label of labels) {
    const labelText = (label.textContent || "").trim();

    for (const rule of rules) {
      if (rule.re.test(labelText)) {
        log("matching label found", { text: labelText, rule: rule.re.toString() });
        const input = findInputByLabel(label);
        const isSupportedInput =
          input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement;
        const isTextualInput =
          input instanceof HTMLTextAreaElement ||
          ["text", "url", "email", "search", "tel", ""].includes(input?.type || "");

        if (isSupportedInput && isTextualInput) {
          // Only fill default values if useDefaults is true
          // Otherwise, only fill if we have an AI answer
          let valueToFill = aiAnswers[labelText];

          if (!valueToFill && useDefaults) {
            valueToFill = rule.value;
          }

          if (valueToFill) {
            fillInput(input, valueToFill);
          } else if (!useDefaults) {
            log("skipping default fill, waiting for AI answers", { text: labelText });
          }
        } else {
          log("matching label found but suitable text input missing", {
            hasInput: Boolean(input),
            tagName: input?.tagName || null,
            type: input?.type || null
          });
        }
        break;
      }
    }

    // Also check for AI answers for non-basic fields
    if (aiAnswers[labelText]) {
      const input = findInputByLabel(label);
      const isSupportedInput =
        input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement;
      const isTextualInput =
        input instanceof HTMLTextAreaElement ||
        ["text", "url", "email", "search", "tel", ""].includes(input?.type || "");

      if (isSupportedInput && isTextualInput) {
        fillInput(input, aiAnswers[labelText]);
      }
    }
  }
}

async function fetchAiAnswers(applicationUrl) {
  log("fetching AI answers", { applicationUrl });

  // Extract questions from the page
  const labels = document.querySelectorAll("label");
  const questions = {};

  for (const label of labels) {
    const labelText = (label.textContent || "").trim();
    if (labelText) {
      // Check if this is a question field (not basic info like LinkedIn, phone, etc.)
      const isBasicField =
        LINKEDIN_LABEL_RE.test(labelText) ||
        PHONE_LABEL_RE.test(labelText) ||
        PORTFOLIO_LABEL_RE.test(labelText) ||
        SALARY_LABEL_RE.test(labelText);

      if (!isBasicField) {
        questions[labelText] = "string";
      }
    }
  }

  if (Object.keys(questions).length === 0) {
    log("no questions found to ask AI");
    return;
  }

  // Use background script to fetch AI answers to avoid CORS issues
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'FETCH_AI_ANSWERS',
          data: { applicationUrl, questions }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Unknown error'));
          }
        }
      );
    });

    aiAnswers = response;
    log("AI answers received", { count: Object.keys(aiAnswers).length });
  } catch (error) {
    log("failed to fetch AI answers", { error: error.message });
  }
}

function startObserver(customValues) {
  log("observer starting", { initialDelayMs: INITIAL_FILL_DELAY_MS });

  // Parse application URL from current page and extract the application ID
  const fullUrl = window.location.href;
  // Extract the application ID from URLs like:
  // https://jobs.ashbyhq.com/vibiz/e4d28e9f-6833-418c-bb91-d96f6f0cedca/application?...
  const idMatch = fullUrl.match(/\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\//i);
  applicationUrl = idMatch ? idMatch[1] : fullUrl;
  log("applicationUrl determined", { fullUrl, applicationUrl });

  // First pass: fill only with AI answers (no defaults yet)
  for (const retryDelayMs of RETRY_DELAYS_MS) {
    const totalDelayMs = INITIAL_FILL_DELAY_MS + retryDelayMs;
    window.setTimeout(() => {
      log("scheduled AI-only fill fired", { totalDelayMs });
      autofillFields(customValues, false);
    }, totalDelayMs);
  }

  // Fetch AI answers first, then fill with defaults after receiving them
  fetchAiAnswers(applicationUrl).then(() => {
    log("AI answers received, scheduling default fill");
    // After receiving AI answers, do another pass with defaults enabled
    // to fill any remaining basic fields that weren't covered by AI
    for (const retryDelayMs of RETRY_DELAYS_MS) {
      const totalDelayMs = INITIAL_FILL_DELAY_MS + retryDelayMs + 500;
      window.setTimeout(() => {
        log("scheduled default fill fired", { totalDelayMs });
        autofillFields(customValues, true);
      }, totalDelayMs);
    }
  });

  const observer = new MutationObserver(() => {
    log("mutation observed, rescanning");
    // On mutation, always use defaults since AI answers should already be loaded
    autofillFields(customValues, true);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

chrome.storage.sync.get(["linkedinUrl"], ({ linkedinUrl }) => {
  log("storage loaded", { linkedinUrl });
  startObserver({ linkedinUrl });
});
