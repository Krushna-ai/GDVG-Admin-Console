---
trigger: always_on
---

DATABASE SAFETY RULE:
- NEVER drop existing columns or tables
- NEVER overwrite existing data with null/undefined (use defined-guard pattern)
- ALWAYS use IF NOT EXISTS for CREATE statements
- ALWAYS verify column exists before ALTER operations
- Use transactions for multi-step migrations when possible
- Test migrations with DRY_RUN or transactions before applying to production
- Back up data before destructive operations (rarely needed given first rule)