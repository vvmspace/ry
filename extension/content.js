const LINKEDIN_LABEL_RE = /linkedin/i;
const PHONE_LABEL_RE = /telephone|phone/i;
const PORTFOLIO_LABEL_RE = /portfolio|site/i;
const SALARY_LABEL_RE = /salary|expectations|compensation/i;

const FILLED_FLAG = "autofillApplied";
const INITIAL_FILL_DELAY_MS = 2000;
const RETRY_DELAYS_MS = [0, 300, 1000, 2000, 4000];
const LOG_PREFIX = "[remoteyeah-autofill]";

const hashmap = {
  "linkedIn": "https://www.linkedin.com/in/vladimir-myagdeev-b03322160/",
  "phone": "+37498330380",
  "portfolio": "https://github.com/vvmspace/theproject",
  "salary usd": "8000",
  "salary eur": "7000",
  "salary expectations": "84000-132000$/y"
};

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
    log("skipping fill", {
      hasInput: Boolean(input),
      hasValue: Boolean(value),
      alreadyFilled: input?.dataset?.[FILLED_FLAG] === "true"
    });
    return;
  }

  if (input.value && input.value.trim().length > 0) {
    log("input already has value, skipping", {
      id: input.id,
      name: input.name,
      value: input.value
    });
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

function autofillFields(customValues = {}) {
  const labels = document.querySelectorAll("label");
  log("scan started", { labelsCount: labels.length });

  const linkedinUrl = customValues.linkedinUrl || hashmap.linkedIn;
  const rules = [
    { re: LINKEDIN_LABEL_RE, value: linkedinUrl },
    { re: PHONE_LABEL_RE, value: hashmap.phone },
    { re: PORTFOLIO_LABEL_RE, value: hashmap.portfolio },
    { re: SALARY_LABEL_RE, value: hashmap["salary expectations"] }
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
          fillInput(input, rule.value);
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
  }
}

function startObserver(customValues) {
  log("observer starting", { initialDelayMs: INITIAL_FILL_DELAY_MS });
  for (const retryDelayMs of RETRY_DELAYS_MS) {
    const totalDelayMs = INITIAL_FILL_DELAY_MS + retryDelayMs;
    window.setTimeout(() => {
      log("scheduled fill fired", { totalDelayMs });
      autofillFields(customValues);
    }, totalDelayMs);
  }

  const observer = new MutationObserver(() => {
    log("mutation observed, rescanning");
    autofillFields(customValues);
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
