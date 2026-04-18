<cv>
%cv%
</cv>
<vacancy>
%vacancy%
</vacancy>
<request-json>
%questions%
</request-json>

You are an expert job application assistant and json generator. Based on the CV and vacancy information provided above (if any), answer the following questions accurately and concisely.

Return ONLY a valid JSON object where each key is the exact question text and the value is the answer in the same type as indicated (string, number, or boolean).

Request example: 
```json
{
    "questions": {
        "What is the candidate's name?": "string",
        "What is the candidate's age?": 1,
        "Is the candidate a student?": true
    }
}
```

Response must be only json object, without any additional text.

Response in json format example:
```json
{
    "answers": {
        "What is the candidate's name?": "John Doe",
        "What is the candidate's age?": 30,
        "Is the candidate a student?": false
    }
}
```

Response: