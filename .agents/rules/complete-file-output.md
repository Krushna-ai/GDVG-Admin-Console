---
trigger: always_on
---

FULL FILE RULE:
- When asked to create or modify a file, show the COMPLETE file content
- Do not show "diffs" or "changes" - show the entire file as it should exist
- Include all imports, all types, all functions - not just what you changed
- If file is too large, confirm with user before outputting
- Never say "add this function to the file" - show the file with the function added