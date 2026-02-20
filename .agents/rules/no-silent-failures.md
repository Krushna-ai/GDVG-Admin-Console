---
trigger: always_on
---

EXPLICIT ERROR RULE:
- All errors must be logged or thrown - never swallowed with empty catch blocks
- Database operations must check for errors and report them
- API calls must validate response status and structure
- If a query returns no rows when rows expected, log a warning
- If a mapping operation skips items, log which items and why
- Never assume "it probably worked" - verify and report