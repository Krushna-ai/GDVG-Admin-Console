---
trigger: always_on
---

NO OVER-ENGINEERING RULE:
- Do not create abstractions "for future use"
- Do not add interfaces/types that aren't immediately needed
- Do not create wrapper functions around simple operations
- Do not add error handling for impossible scenarios
- Do not "make it configurable" unless explicitly asked
- Keep code direct and literal - match the complexity of the requirement exactly
- If the prompt shows a simple loop, use a simple loop - don't refactor to async/iterators