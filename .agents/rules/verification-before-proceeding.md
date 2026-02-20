---
trigger: always_on
---

VERIFY BEFORE CONTINUE RULE:
- After EVERY file modification, run: npx tsc --noEmit
- If TypeScript errors exist, FIX THEM before declaring phase complete
- After database migrations, VERIFY tables/columns exist with SELECT queries
- After creating functions, confirm they are callable and return expected types
- NEVER say "this should work" - confirm it works or show the error
- Provide PROOF of verification (command output, query results, etc.)