
<cv>
%cv%
</cv>
<vacancy>
Vacancy text:
%vacancy%

Locations:
%locations%
</vacancy>

GOAL:
Rate match in percents from 1 to 100 (integer), be precise.

LOCATION RULES:
1. If location is specified and timezone is different from UTC+4 for 5 or more hours, the match_rate MUST be decreased by 5%.
2. If the job description or locations specify a mandatory on-site or hybrid presence in any city OTHER than Yerevan, Armenia, the match_rate MUST be decreased by 10%.
3. If relocation is required, the match_rate MUST be decreased by 20%.
4. Ignore location rules for Web3 companies.

Response must be only json object, without any additional text.
Response in json format example:
`{ "match_rate": 87, "comment": "up to 10 words" }`

Response: