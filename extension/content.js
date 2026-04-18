const LINKEDIN_LABEL_RE = /linkedin/i;
const PHONE_LABEL_RE = /telephone|phone/i;
const PORTFOLIO_LABEL_RE = /portfolio|site|github/i;
const SALARY_LABEL_RE = /salary|expectations|compensation/i;

const FILLED_FLAG = "autofillApplied";
const LOG_PREFIX = "[remoteyeah-autofill]";
const API_URL = "http://tma.kingofthehill.pro:4040/api/v1/ai/ask";

const defaultValues = {
  linkedIn: "https://www.linkedin.com/in/vladimir-myagdeev-b03322160/",
  phone: "+37498330380",
  portfolio: "https://github.com/vvmspace/theproject",
  salaryExpectations: "84000-132000$/y"
};

let aiAnswers = {};

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
    return;
  }

  if (input.value && input.value.trim().length > 0) {
    return;
  }

  log("filling input", { id: input.id, name: input.name, value });
  setNativeValue(input, value);
  dispatchInputEvents(input);

  if ((input.value || "").trim() === value) {
    input.dataset[FILLED_FLAG] = "true";
    log("fill confirmed", { id: input.id, name: input.name });
  }
}

function findInputByLabel(label) {
  const htmlFor = label.getAttribute("for");
  if (htmlFor) {
    return document.getElementById(htmlFor);
  }

  const fieldEntry = label.closest(".ashby-application-form-field-entry");
  return (
    fieldEntry?.querySelector("input, textarea") ||
    label.parentElement?.querySelector("input, textarea") ||
    label.querySelector("input, textarea")
  );
}

function isTextualInput(input) {
  return (
    input instanceof HTMLTextAreaElement ||
    ["text", "url", "email", "search", "tel", ""].includes(input?.type || "")
  );
}

function autofillFields(values, customValues = {}) {
  const labels = document.querySelectorAll("label");
  const linkedinUrl = customValues.linkedinUrl || defaultValues.linkedIn;

  for (const label of labels) {
    const labelText = (label.textContent || "").trim();
    if (!labelText) continue;

    let valueToFill = values[labelText];

    // Apply defaults for basic fields if no AI answer
    if (!valueToFill) {
      if (LINKEDIN_LABEL_RE.test(labelText)) {
        valueToFill = linkedinUrl;
      } else if (PHONE_LABEL_RE.test(labelText)) {
        valueToFill = defaultValues.phone;
      } else if (PORTFOLIO_LABEL_RE.test(labelText)) {
        valueToFill = defaultValues.portfolio;
      } else if (SALARY_LABEL_RE.test(labelText)) {
        valueToFill = defaultValues.salaryExpectations;
      }
    }

    if (valueToFill) {
      const input = findInputByLabel(label);
      if (input instanceof HTMLInputElement && isTextualInput(input)) {
        fillInput(input, valueToFill);
      } else if (input instanceof HTMLTextAreaElement) {
        fillInput(input, valueToFill);
      }
    }
  }
}

async function fetchAiAnswers(applicationId) {
  log("fetching AI answers", { applicationId });

  // Extract all questions from labels in one pass
  const labels = document.querySelectorAll("label");
  const questions = {};

  for (const label of labels) {
    const labelText = (label.textContent || "").trim();
    if (!labelText) continue;

    // Skip basic fields - only send actual questions to AI
    const isBasicField =
      LINKEDIN_LABEL_RE.test(labelText) ||
      PHONE_LABEL_RE.test(labelText) ||
      PORTFOLIO_LABEL_RE.test(labelText) ||
      SALARY_LABEL_RE.test(labelText);

    if (!isBasicField) {
      questions[labelText] = "string";
    }
  }

  if (Object.keys(questions).length === 0) {
    log("no questions found to ask AI");
    return {};
  }

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'FETCH_AI_ANSWERS',
          data: { applicationUrl: applicationId, questions }
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

    log("AI answers received", { count: Object.keys(response).length });
    return response;
  } catch (error) {
    log("failed to fetch AI answers", { error: error.message });
    return {};
  }
}

async function init(customValues) {
  log("initialization started");

  // Extract application ID from URL
  const fullUrl = window.location.href;
  const idMatch = fullUrl.match(/\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\//i);
  const applicationId = idMatch ? idMatch[1] : fullUrl;
  log("application ID extracted", { applicationId });

  // Fetch AI answers
  aiAnswers = await fetchAiAnswers(applicationId);

  // Fill all fields (AI answers + defaults)
  autofillFields(aiAnswers, customValues);

  // Mutation observer disabled - ignoring DOM mutations
  // const observer = new MutationObserver(() => {
  //   log("mutation observed, refilling");
  //   autofillFields(aiAnswers, customValues);
  // });

  // observer.observe(document.documentElement, {
  //   childList: true,
  //   subtree: true
  // });
}

chrome.storage.sync.get(["linkedinUrl"], ({ linkedinUrl }) => {
  log("storage loaded", { linkedinUrl });
  init({ linkedinUrl });
});
