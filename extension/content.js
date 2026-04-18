const LINKEDIN_LABEL_RE = /linkedin/i;
const PHONE_LABEL_RE = /telephone|phone/i;
const PORTFOLIO_LABEL_RE = /portfolio|site|github/i;
const SALARY_LABEL_RE = /salary|expectations|compensation/i;

const FILLED_FLAG = "autofillApplied";
const LOG_PREFIX = "[remoteyeah-autofill]";
const API_URL = "http://tma.kingofthehill.pro:4040/api/v1/ai/ask";
const toSnakeCase = (str) => {
  if (!str) return '';

  return str
    .trim()                                // trim
    .toLowerCase()                         // toLowerCase
    .replace(/[\s-]+/g, '_')               // replace spaces and hyphens with underscores
    // replace special characters with empty string
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/^-+|-+$/g, '');              // remove leading/trailing hyphens
};
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
    try {
      descriptor.set.call(input, value);
    } catch (error) {
      log("failed to set value", { id: input.id, name: input.name, error });
      input.value = value;
    }
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
  if (fieldEntry) {
    return fieldEntry.querySelector("input, textarea");
  }

  // Workable: look for textarea/input by aria-labelledby or within the same parent structure
  const labelId = label.querySelector("[id]")?.id;
  if (labelId) {
    const inputById = document.querySelector(`[aria-labelledby="${labelId}"]`);
    if (inputById) {
      return inputById;
    }
  }

  // Lever: look for input/textarea within the same parent container
  const appQuestion = label.closest(".application-question");
  if (appQuestion) {
    const appField = appQuestion.querySelector(".application-field");
    if (appField) {
      return appField.querySelector("input, textarea");
    }
  }

  return (
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

  console.log("values", values);
  const labels = document.querySelectorAll("label");
  const linkedinUrl = customValues.linkedinUrl || defaultValues.linkedIn;

  // Build a map of snake_case label text -> label element for lookup
  const labelTextMap = new Map();
  for (const label of labels) {
    const labelText = (label.textContent || "").trim();
    if (labelText) {
      labelTextMap.set(toSnakeCase(labelText), label);
    }
  }

  // First pass: fill by snake_case keys from AI answers matching label text
  for (const [snakeKey, value] of Object.entries(values)) {
    const label = labelTextMap.get(snakeKey);
    if (label) {
      const input = findInputByLabel(label);
      if (input instanceof HTMLInputElement && isTextualInput(input)) {
        fillInput(input, value);
      } else if (input instanceof HTMLTextAreaElement) {
        fillInput(input, value);
      }
    }
  }

  // Second pass: traditional label-based filling for basic fields
  for (const label of labels) {
    const labelText = (label.textContent || "").trim();
    if (!labelText) continue;

    let valueToFill = values[toSnakeCase(labelText)];

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

  // Workable: additionally try to fill inputs by data-ui attribute matching question keys
  const workableInputs = document.querySelectorAll("textarea[data-ui], input[data-ui]");
  for (const input of workableInputs) {
    if (input.dataset[FILLED_FLAG] === "true") {
      continue;
    }
    if (input.value && input.value.trim().length > 0) {
      continue;
    }

    const dataUi = input.getAttribute("data-ui");
    if (dataUi && values[toSnakeCase(dataUi)]) {
      fillInput(input, values[toSnakeCase(dataUi)]);
    }

    // Also try to match via aria-labelledby text
    const labelId = input.getAttribute("aria-labelledby");
    if (labelId) {
      const labelEl = document.getElementById(labelId);
      if (labelEl) {
        const labelText = (labelEl.textContent || "").trim();
        const snakeKey = toSnakeCase(labelText);
        if (values[snakeKey]) {
          fillInput(input, values[snakeKey]);
        }
      }
    }
  }

  // Lever: fill inputs within .application-question elements
  const leverQuestions = document.querySelectorAll(".application-question.custom-question");
  for (const question of leverQuestions) {
    // Find the label text within .application-label
    const labelEl = question.querySelector(".application-label .text");
    if (!labelEl) continue;

    const labelText = (labelEl.textContent || "").trim();
    if (!labelText) continue;

    const snakeKey = toSnakeCase(labelText);
    const valueToFill = values[snakeKey];
    if (!valueToFill) continue;

    // Find the textarea/input within .application-field
    const appField = question.querySelector(".application-field");
    if (appField) {
      const input = appField.querySelector("input, textarea");
      if (input && !input.dataset[FILLED_FLAG] && (!input.value || input.value.trim().length === 0)) {
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
  const labelMap = new Map(); // Map snake_case key -> labelText for later lookup



  for (const label of labels) {
    const labelText = (label.textContent || "").trim();
    if (!labelText) continue;

    // Skip basic fields - only send actual questions to AI
    const isBasicField =
      LINKEDIN_LABEL_RE.test(labelText) ||
      PHONE_LABEL_RE.test(labelText) ||
      PORTFOLIO_LABEL_RE.test(labelText) ||
      SALARY_LABEL_RE.test(labelText);


    const isIgnored = ['Name', 'Yes', 'Email', 'to relocate', 'Twitter', 'LinkedIn', 'GitHub', 'Portfolio'].find(word => labelText.includes(word));

    console.log("labelText", labelText, "isIgnored", isIgnored);

    if (!isBasicField && !isIgnored) {
      const snakeKey = toSnakeCase(labelText);
      questions[snakeKey] = labelText;
      labelMap.set(snakeKey, labelText);
    }
  }

  // Workable: additionally extract questions from textarea/input elements with data-ui attribute
  const workableInputs = document.querySelectorAll("textarea[data-ui], input[data-ui]");
  for (const input of workableInputs) {
    const dataUi = input.getAttribute("data-ui");
    if (!dataUi) continue;

    // Try to find the associated label via aria-labelledby
    const labelId = input.getAttribute("aria-labelledby");
    let labelText = "";

    if (labelId) {
      const labelEl = document.getElementById(labelId);
      if (labelEl) {
        labelText = (labelEl.textContent || "").trim();
      }
    }

    // If no label found via aria-labelledby, use data-ui as fallback key
    if (!labelText) {
      labelText = dataUi;
    }

    // Skip basic fields and ignored patterns
    const isBasicField =
      LINKEDIN_LABEL_RE.test(labelText) ||
      PHONE_LABEL_RE.test(labelText) ||
      PORTFOLIO_LABEL_RE.test(labelText) ||
      SALARY_LABEL_RE.test(labelText);

    const isIgnored = ['Name', 'Yes', 'Email', 'to relocate', 'Twitter', 'LinkedIn', 'GitHub', 'Portfolio'].find(word => labelText.includes(word));

    if (!isBasicField && !isIgnored) {
      const snakeKey = toSnakeCase(labelText);
      questions[snakeKey] = labelText;
      labelMap.set(snakeKey, labelText);
    }
  }

  // Lever: extract questions from .application-question elements
  const leverQuestions = document.querySelectorAll(".application-question.custom-question");
  for (const question of leverQuestions) {
    // Find the label text within .application-label
    const labelEl = question.querySelector(".application-label .text");
    if (!labelEl) continue;

    const labelText = (labelEl.textContent || "").trim();
    if (!labelText) continue;

    // Skip basic fields and ignored patterns
    const isBasicField =
      LINKEDIN_LABEL_RE.test(labelText) ||
      PHONE_LABEL_RE.test(labelText) ||
      PORTFOLIO_LABEL_RE.test(labelText) ||
      SALARY_LABEL_RE.test(labelText);

    const isIgnored = ['Name', 'Yes', 'Email', 'to relocate', 'Twitter', 'LinkedIn', 'GitHub', 'Portfolio'].find(word => labelText.includes(word));

    if (!isBasicField && !isIgnored) {
      const snakeKey = toSnakeCase(labelText);
      questions[snakeKey] = labelText;
      labelMap.set(snakeKey, labelText);
    }
  }

  if (Object.keys(questions).length === 0) {
    log("no questions found to ask AI");
    return {};
  }

  console.log("questions", questions);

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

  await new Promise(resolve => setTimeout(resolve, 5000));
  // Fetch AI answers
  aiAnswers = await fetchAiAnswers(applicationId);

  // Fill all fields (AI answers + defaults)
  autofillFields(aiAnswers.answers.answers, customValues);

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
