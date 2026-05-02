# LinkedIn Chrome Extension

This extension automatically fills job application forms on Ashby job pages. It uses AI to answer custom questions and fills basic information (LinkedIn URL, phone, portfolio, salary expectations) based on label matching.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select `path/to/extension`.
5. Open the extension popup and save your LinkedIn profile URL.

## How it works

### Workflow

1. Extension waits for job page to load
2. Extension parses labels for inputs on page
3. Extension sends POST request to `https://tma.kingofthehill.pro/api/v1/ai/ask?applicationUrl=<job_url>` with extracted questions:
```json
{
  "questions": {
    "What is your favorite cow?": "string",
    "How old are you?": "string",
    "Do you like AI?": "string"
  }
}
```
4. Extension receives JSON response with answers:
```json
{
  "What is your favorite cow?": "My favorite cow is Daisy.",
  "How old are you?": "100",
  "Do you like AI?": "true"
}
```
5. Extension fills the answers into the input fields
6. Default values are used for basic fields (LinkedIn, phone, portfolio, salary) that were not answered by AI

### Default Values

```json
{
  "linkedIn": "https://www.linkedin.com/in/vladimir-myagdeev-b03322160/",
  "phone": "+37498330380",
  "portfolio": "https://github.com/vvmspace/theproject",
  "salaryExpectations": "84000-132000$/y"
}
```

### Label Matching

- The content script checks if input labels contain keywords like "LinkedIn", "phone", "portfolio", "salary", etc.
- If the matching input is empty, it inserts the saved value or AI-generated answer.
- It also watches dynamic forms using MutationObserver, so Ashby-style application pages are handled after render.

## Supported Platforms

- Ashby (`https://jobs.ashbyhq.com/*`)
