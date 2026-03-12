# RemoteYeah.com parser

## Environment variables

MONGODB_CONNECTION_STRING
MONGODB_DATABASE=remoteyeah
REMOTEYEAH_SEARCH_URLS=https://remoteyeah.com/remote-nestjs-jobs,https://remoteyeah.com/remote-nestjs-jobs - separated by comma
STOP_WORDS=ruby,python,dotnet


## Stack

Node.js
Mongoose
Puppeteer


## Parsing steps

### Jobs List Parser Worker

Parse all jobs (links like https://remoteyeah.com/jobs/...), first page only and save to db with status `pending`. (ex: jobs_list_page.example.html) with job url and jobs list url.
Ignore urls with stop words from STOP_WORDS env variable case insensitive.
If page with same url is exist in database - ignore it.


### Job Page Parser Worker
ex: job_page.example.html

Takes one `pending` job from db.
Parsing it.
Clicks apply -> gets opened (after redirect ...) link
Gets domain as additional field.
Saves job to db with status `saved`.

## Job page

Job page contains:
- title
- company name
- salary
- description
- application form - it is a hidden link: when you click apply - it opens link with application page. We need to extract application page url.


## CV Generation Worker

1. Gets 1 `saved` from DB.

2. POST https://tma.kingofthehill.pro/api/v1/generate_cv
```json
{
    "vacancy_text": "Put title + vacancy text there",
    "template": "dark_calendly",
    "model": "gemini-3.1-pro-preview"
}
```

3. Gets response like:
```
{
  "success": true,
  "html_url": "string",
  "pdf_url": "string",
  "pdf_absolute_path": "string",
  "greeting_message": "string"
}
```
4. Gets greeting_message from response
5. Gets pdf_url from response
6. cv_url=`https://tma.kingofthehill.pro${pdf_url}`
7. saves with status `generated`

## API

GET /api/v1/jobs

list jobs ordered by updatedAt desc and `generated` status first with optional filters:
- status
- query= - desciption or title should include
- exclude= - desciption and title should not include
- domain= - domain should include

PATCH /api/jobs/:_id

{ status: pending, saved, generated, applied, cancelled }

## Frontend
Nuxt.js, adaptive, dark mode, mobile first, same port as API.

### /

List of vacancies Adaptive: table like divs on wide screen, cards on mobile.

Auto-refresh with select interval: off (default), 5s, 10s, 30s, 1m, 5m, 10m, 30m
Clickable filter by status

Fields:
- position_title: text
- link to vacancy (applicationUrl)
- status: select box with statuses, call update API on change and fetch vacancies list
- greeting_message copy icon if greeting_message is provided
- salary
- link to CV: PDF icon, download on click

## Acceptance criteria:

Always run script on what you worked on before finish and fix if you have some errors.