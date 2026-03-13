const linkedinInput = document.getElementById("linkedinUrl");
const saveButton = document.getElementById("saveButton");
const status = document.getElementById("status");

function setStatus(message) {
  status.textContent = message;
}

chrome.storage.sync.get(["linkedinUrl"], ({ linkedinUrl }) => {
  linkedinInput.value = linkedinUrl || "";
});

saveButton.addEventListener("click", async () => {
  const linkedinUrl = linkedinInput.value.trim();

  await chrome.storage.sync.set({ linkedinUrl });
  setStatus("Saved");
});
