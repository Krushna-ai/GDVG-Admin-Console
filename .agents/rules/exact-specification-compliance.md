---
trigger: always_on
---

EXACT MATCH RULE:
- Implement EXACTLY what the prompt specifies - no more, no less
- Do not "improve" or "optimize" beyond requirements
- Do not add features not explicitly requested
- Use EXACT variable names, function names, and column names as specified
- Match EXACT data types and constraints from the specification
- If prompt says "slice(0, 20)" do not change to slice(0, 10) or slice(0, 50)
- If prompt specifies specific SQL, use that SQL verbatim unless there's a syntax error