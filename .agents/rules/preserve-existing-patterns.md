---
trigger: always_on
---

PATTERN PRESERVATION RULE:
- When modifying existing files, MATCH the existing code style exactly
- Use same indentation, quote style, and naming conventions as surrounding code
- Import from same paths using same patterns as existing imports
- If existing code uses `?? []` for defaults, use `?? []` - don't switch to `|| []`
- If existing code uses specific error handling, preserve that pattern
- Do not "modernize" or "clean up" existing code while making changes