const LINKEDIN_LABEL_RE = /linkedin/i;
const FILLED_FLAG = "linkedinAutofillApplied";
const INITIAL_FILL_DELAY_MS = 2000;
const RETRY_DELAYS_MS = [0, 300, 1000, 2000, 4000];
const LOG_PREFIX = "[linkedin-autofill]";

const hashmap = {
  "linkedIn": "https://www.linkedin.com/in/vladimir-myagdeev-b03322160/",
  "salary usd": "8000",
  "salary eur": "7000"
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

function fillInput(input, linkedinUrl) {
  if (!input || !linkedinUrl || input.dataset[FILLED_FLAG] === "true") {
    log("skipping fill", {
      hasInput: Boolean(input),
      hasLinkedinUrl: Boolean(linkedinUrl),
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

  log("filling input", { id: input.id, name: input.name, linkedinUrl });
  setNativeValue(input, linkedinUrl);
  dispatchInputEvents(input);

  if ((input.value || "").trim() === linkedinUrl) {
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

function fillLinkedinFields(linkedinUrl) {
  if (!linkedinUrl) {
    log("linkedin url is empty, nothing to fill");
    return;
  }

  const labels = document.querySelectorAll("label");
  log("scan started", { labelsCount: labels.length });

  for (const label of labels) {
    const labelText = (label.textContent || "").trim();
    if (!LINKEDIN_LABEL_RE.test(labelText)) {
      continue;
    }

    log("matching label found", { text: labelText });
    const input = findInputByLabel(label);
    const isSupportedInput =
      input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement;
    const isTextualInput =
      input instanceof HTMLTextAreaElement ||
      ["text", "url", "email", "search", "tel", ""].includes(input?.type || "");

    if (isSupportedInput && isTextualInput) {
      fillInput(input, linkedinUrl);
    } else {
      log("matching label found but suitable text input missing", {
        hasInput: Boolean(input),
        tagName: input?.tagName || null,
        type: input?.type || null
      });
    }
  }
}

function startObserver(linkedinUrl) {
  log("observer starting", { initialDelayMs: INITIAL_FILL_DELAY_MS });
  for (const retryDelayMs of RETRY_DELAYS_MS) {
    const totalDelayMs = INITIAL_FILL_DELAY_MS + retryDelayMs;
    window.setTimeout(() => {
      log("scheduled fill fired", { totalDelayMs });
      fillLinkedinFields(linkedinUrl);
    }, totalDelayMs);
  }

  const observer = new MutationObserver(() => {
    log("mutation observed, rescanning");
    fillLinkedinFields(linkedinUrl);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

chrome.storage.sync.get(["linkedinUrl"], ({ linkedinUrl }) => {
  log("storage loaded", { linkedinUrl });
  startObserver(linkedinUrl || "https://www.linkedin.com/in/vladimir-myagdeev-b03322160/");
});
