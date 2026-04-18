# Chrome Extension

Supported platforms:
- Ashby

1. Extension waits for job page to load
2. Extenstion parses job id from url
3. Extension parse labels for inputs on page
4. Extension sends POST request to https://tma.kingofthehill.pro/api/v1/ai/ask?applicationUrl=job_id:
```
{
  "questions": {
    "What is your favotive cow?": "string",
    "How old are you?": 100,
    "Do you like AI?": true
  }
}
```
5. Extension receives JSON response with answers
```
{
  "What is your favotive cow?": "My favorite cow is Daisy.",
  "How old are you?": 100,
  "Do you like AI?": true
}
```
6. Extension fills the answers into the input fields
7. overwrite default values for inputs that were not answered
