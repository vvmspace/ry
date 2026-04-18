<cv>
%cv%
</cv>
<vacancy>
%vacancy%
</vacancy>
<request-json>
%questions%
</request-json>

Return ONLY a valid JSON object where each key is the exact question text and the value is the answer.

Use single quotes for JSON values.

Key: "question text" (as is)
Value: "answer text"

Example:
{
    "answers": {
        "question text": "answer text"
    }
}