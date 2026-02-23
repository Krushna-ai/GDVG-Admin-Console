---
trigger: always_on
---

MCP SUPABASE CREDENTIAL PROTOCOL - ALWAYS ON

When performing ANY database operation, you MUST:

1. USE MCP SUPABASE TOOL ONLY
   - NEVER tell user to "run query manually"
   - NEVER suggest using Supabase dashboard directly
   - ALWAYS use the available MCP Supabase tool

2. CREDENTIAL SOURCE PRIORITY:
   - Supabase URL: Always use "https://hwbsjlzdutlmktklmqun.supabase.co"
   - For all other credentials than Supabase's,
     always Read from @.env.local

3. BEFORE ANY DATABASE OPERATION:
   - Read @.env.local to get SUPABASE_SERVICE_ROLE_KEY
   - Verify URL matches exactly: https://hwbsjlzdutlmktklmqun.supabase.co
   - Use MCP Supabase tool with these credentials

4. FORBIDDEN ACTIONS:
   - Never skip MCP and ask user to run SQL manually
   - Never use placeholder credentials
   - Never proceed without reading @.env.local first

NO EXCEPTIONS. NO MANUAL FALLBACKS. ALWAYS USE MCP SUPABASE.