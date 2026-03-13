# LinkedIn Chrome Extension

This extension fills inputs whose `label` mentions `LinkedIn`.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select `path/to/ry/extension`.
5. Open the extension popup and save your LinkedIn profile URL.

## How it works

### HashMap example

```json
{
  "linkedIn": "https://www.linkedin.com/in/vladimir-myagdeev-b03322160/",
  "salary usd": "8000",
  "salary eur": "7000",
  "phone": "+1234567890",
  "e-mail": "[EMAIL_ADDRESS]"
}
```

- The content script split keys by space and check if input label contains any of the keys.
- If the matching input is empty, it inserts your saved value.
- It also watches dynamic forms, so Ashby-style application pages are handled after render.
