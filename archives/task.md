# GDVG Admin Console - Master Task Tracker
## Enhanced Architecture Migration + Data Sync Improvements

> **Project:** GDVG Admin Console  
> **Stack:** Next.js 16.1.1 + Supabase (Free Tier) + Vercel (Free Tier) + GitHub Actions (Free Tier)  
> **Goal:** Migrate to Option B architecture with enhanced Data Sync capabilities  
> **Context:** All previous phases (0-7) are COMPLETE. This document tracks the new migration work.

---

## 🎯 Quick Reference

| Document | Purpose |
|----------|---------|
| [Data_Sync_Enhancement_Agent_Guide.md](file:///C:/Users/Krushna/.gemini/antigravity/brain/9bc60852-85b0-4e2d-89da-f9e2059aa762/Data_Sync_Enhancement_Agent_Guide.md) | User requirements for Data Sync, Gap Filling, Bulk Import |
| [Option_B_Architecture_Migration_Plan.md](file:///d:/GDVG%20Projects/GDVG-Admin-Console/archives/Option_B_Architecture_Migration_Plan.md) | Technical migration plan to enhanced architecture |

---

## Phase 8: Infrastructure Foundation

### 8.1 Upstash Redis Setup
- [x] 8.1.1 Create Upstash Redis account and database ✅
- [x] 8.1.2 Install @upstash/redis package and configure environment ✅

> **8.1.1 Description:**
> Create a free Upstash account at upstash.com. Create a new Redis database selecting "Global" region for best latency. Copy the REST URL and REST Token. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to both `.env.local` (local) and Vercel environment variables (production). The free tier provides 10,000 commands/day which is sufficient for caching content lists and individual content items.
>
> **8.1.2 Description:**
> Run `npm install @upstash/redis` to add the Upstash Redis client. Create `src/lib/config/redis.ts` with a singleton Redis client instance that reads from environment variables. This file will export a configured Redis client that other services can import. Verify the connection works by adding a simple health check endpoint or console log during development.

---

### 8.2 Cache Service Implementation
- [x] 8.2.1 Create cache.service.ts with core caching functions ✅
- [x] 8.2.2 Add cache invalidation utilities ✅

> **8.2.1 Description:**
> Create `src/lib/services/cache.service.ts` that provides a clean API for caching operations. Implement the following methods:
> - `getContentList(key)` / `setContentList(key, data)` - Cache content lists with 5-minute TTL
> - `getContent(id)` / `setContent(id, data)` - Cache individual content with 15-minute TTL
> - `getPerson(id)` / `setPerson(id, data)` - Cache person details with 15-minute TTL
> Use `redis.setex()` for TTL-based caching and `redis.get()` for retrieval. Return `null` for cache misses.
>
> **8.2.2 Description:**
> Extend cache.service.ts with invalidation utilities:
> - `invalidateContent(id)` - Delete specific content cache when updated
> - `invalidateContentLists()` - Delete all content list caches (use key patterns)
> - `invalidateAll()` - Nuclear option to clear entire cache
> - `getCacheStats()` - Return cache hit/miss metrics for monitoring
> These utilities will be called by update endpoints to ensure cache consistency.

---

### 8.3 Database Schema: Sync Settings Table
- [x] 8.3.1 Create sync_settings table with RLS policies ✅
- [x] 8.3.2 Insert default settings and create API endpoint ✅

> **8.3.1 Description:**
> Execute SQL migration to create `sync_settings` table in Supabase. Schema:
> ```sql
> CREATE TABLE sync_settings (
>     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>     setting_key VARCHAR(100) UNIQUE NOT NULL,
>     setting_value JSONB NOT NULL,
>     updated_at TIMESTAMPTZ DEFAULT NOW(),
>     updated_by UUID REFERENCES auth.users(id)
> );
> ```
> Enable RLS and create policy allowing authenticated users to read/write. This table stores the cron pause/resume state and other sync configuration.
>
> **8.3.2 Description:**
> Insert default settings rows:
> - `cron_status`: `{"is_paused": false, "paused_at": null, "paused_by": null}`
> - `sync_schedule`: `{"frequency": "daily", "cron_expression": "30 21 * * *"}`
> Create `/api/sync/settings/route.ts` with GET (read settings) and PUT (update settings) handlers. This API will be called by the dashboard and by GitHub Actions to check pause state.

---

### 8.4 Database Schema: Gap Registry Table
- [x] 8.4.1 Create gap_registry table with indexes ✅
- [x] 8.4.2 Create gap_registry API endpoints ✅

> **8.4.1 Description:**
> Execute SQL migration to create `gap_registry` table for tracking missing/skipped content:
> ```sql
> CREATE TABLE gap_registry (
>     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>     tmdb_id INTEGER NOT NULL,
>     content_type VARCHAR(20) NOT NULL,
>     gap_type VARCHAR(30) NOT NULL, -- 'sequential', 'popularity', 'temporal', 'metadata'
>     priority_score DECIMAL(5,2) DEFAULT 0,
>     skip_reason TEXT,
>     detected_at TIMESTAMPTZ DEFAULT NOW(),
>     filled_at TIMESTAMPTZ,
>     fill_attempts INTEGER DEFAULT 0,
>     last_attempt_error TEXT,
>     is_resolved BOOLEAN DEFAULT FALSE,
>     UNIQUE(tmdb_id, content_type)
> );
> ```
> Add indexes: `idx_gap_registry_unresolved` (partial on is_resolved=false), `idx_gap_registry_priority` (priority_score DESC). Enable RLS.
>
> **8.4.2 Description:**
> Create API endpoints for gap management:
> - `GET /api/gaps/route.ts` - List gaps with filtering (resolved, type, pagination)
> - `POST /api/gaps/route.ts` - Register a new gap (used during sync when skipping)
> - `PATCH /api/gaps/[id]/route.ts` - Update gap status (mark as resolved, increment attempts)
> - `GET /api/gaps/stats/route.ts` - Get gap statistics (counts by type, unresolved total)

---

### 8.5 Database Schema: Import Jobs & Presets Tables
- [x] 8.5.1 Create import_jobs table for queue management ✅
- [x] 8.5.2 Create import_presets table for saved configurations ✅

> **8.5.1 Description:**
> Execute SQL migration to create `import_jobs` table:
> ```sql
> CREATE TABLE import_jobs (
>     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>     name VARCHAR(100) NOT NULL,
>     configuration JSONB NOT NULL, -- stores filters: type, country, date, genre, popularity
>     status VARCHAR(20) DEFAULT 'pending', -- pending, running, paused, completed, failed
>     progress JSONB DEFAULT '{"current":0,"total":0,"success":0,"failed":0,"skipped":0}',
>     priority INTEGER DEFAULT 0,
>     started_at TIMESTAMPTZ,
>     completed_at TIMESTAMPTZ,
>     created_by UUID REFERENCES auth.users(id),
>     created_at TIMESTAMPTZ DEFAULT NOW(),
>     error_log TEXT[]
> );
> ```
> Add index on status column. Enable RLS. This table tracks bulk import jobs with progress.
>
> **8.5.2 Description:**
> Execute SQL migration to create `import_presets` table:
> ```sql
> CREATE TABLE import_presets (
>     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>     name VARCHAR(100) NOT NULL,
>     description TEXT,
>     configuration JSONB NOT NULL,
>     created_by UUID REFERENCES auth.users(id),
>     created_at TIMESTAMPTZ DEFAULT NOW(),
>     last_used_at TIMESTAMPTZ,
>     use_count INTEGER DEFAULT 0
> );
> ```
> Enable RLS. This table stores reusable import configurations like "K-Drama 2024" or "Hollywood Action".

---

### 8.6 Database Schema: Sync Logs Table
- [x] 8.6.1 Create sync_logs table for history tracking ✅
- [x] 8.6.2 Create sync logs API endpoint ✅

> **8.6.1 Description:**
> Execute SQL migration to create `sync_logs` table:
> ```sql
> CREATE TABLE sync_logs (
>     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>     sync_type VARCHAR(30) NOT NULL, -- 'cron', 'manual', 'bulk_import', 'gap_fill'
>     started_at TIMESTAMPTZ NOT NULL,
>     completed_at TIMESTAMPTZ,
>     status VARCHAR(20) NOT NULL, -- 'running', 'completed', 'failed', 'cancelled'
>     summary JSONB DEFAULT '{}', -- {"total":100,"added":45,"updated":30,"skipped":20,"failed":5}
>     error_details TEXT[],
>     triggered_by UUID REFERENCES auth.users(id),
>     metadata JSONB DEFAULT '{}'
> );
> CREATE INDEX idx_sync_logs_date ON sync_logs(started_at DESC);
> ```
> Enable RLS. This table stores all sync operation history for debugging and analytics.
>
> **8.6.2 Description:**
> Create `/api/sync/logs/route.ts` with:
> - `GET` - List sync logs with pagination, date filtering, type filtering
> - `POST` - Create new log entry (internal use when starting syncs)
> - `PATCH` - Update log (internal use when completing syncs)
> Add helper functions `startSyncLog(type)` and `completeSyncLog(id, summary)` in sync.service.ts.

---

## Phase 9: Sync Controller & Cron System

### 9.1 Cron Controller API Endpoints
- [x] 9.1.1 Create /api/sync/pause endpoint ✅
- [x] 9.1.2 Create /api/sync/resume endpoint ✅

> **9.1.1 Description:**
> Create `src/app/api/sync/pause/route.ts`:
> - `POST` handler that updates `cron_status` in sync_settings table
> - Set `is_paused: true`, `paused_at: NOW()`, `paused_by: user_id`
> - Return success response with timestamp
> - This endpoint will be called from the dashboard when user clicks "Pause" button
> - Also create a sync log entry noting the pause action
>
> **9.1.2 Description:**
> Create `src/app/api/sync/resume/route.ts`:
> - `POST` handler that updates `cron_status` in sync_settings table
> - Set `is_paused: false`, `resumed_at: NOW()`, `resumed_by: user_id`
> - Clear `paused_at` and `paused_by`
> - Return success response with timestamp
> - Create a sync log entry noting the resume action

---

### 9.2 Cron Controller Dashboard Integration
- [x] 9.2.1 Modify GitHub Actions to check pause state ✅
- [x] 9.2.2 Create SyncController UI component ✅

> **9.2.1 Description:**
> Modify `.github/workflows/auto-import.yml` to add pause check:
> - Add a step at the beginning that calls `GET /api/sync/status`
> - Use `jq` to parse response and check `is_paused` field
> - If paused, `exit 0` to skip the workflow gracefully
> - Log a message to GitHub Actions summary noting skip reason
> - Same modification needed for `sync-changes.yml` and `bulk-import.yml`
>
> **9.2.2 Description:**
> Create `src/app/admin/data-sync/components/SyncController.tsx`:
> - Display current sync status (Active/Paused) with color indicator
> - Show last run time and next scheduled run time
> - Pause/Resume button that calls respective API endpoints
> - "Sync Now" button that triggers manual sync
> - Loading states for all actions
> - Uses dark theme styling matching the rest of admin console

---

### 9.3 Enhanced Sync Status Endpoint
- [x] 9.3.1 Upgrade /api/sync/status for comprehensive data ✅
- [x] 9.3.2 Add sync statistics helper functions ✅

> **9.3.1 Description:**
> Upgrade existing `src/app/api/sync/status/route.ts` to return comprehensive data:
> - `is_paused`: Current pause state from sync_settings
> - `paused_at`, `paused_by`: When/who paused if applicable
> - `last_run`: Latest sync_logs entry with summary
> - `next_run`: Calculate next scheduled run based on cron expression
> - `active_jobs`: Count of running import_jobs
> - `pending_gaps`: Count of unresolved gaps in gap_registry
> - `content_stats`: Total content count, breakdown by type
>
> **9.3.2 Description:**
> Add helper functions to `src/lib/services/sync.service.ts`:
> - `getSyncSettings()` - Fetch all settings from sync_settings table
> - `updateSyncSetting(key, value)` - Update a specific setting
> - `calculateNextRun(cronExpression)` - Parse cron and return next Date
> - `getSyncStats()` - Aggregate stats from content table
> These functions centralize sync-related database operations.

---

## Phase 10: Data Sync Dashboard UI

### 10.1 Data Sync Page Structure
- [x] 10.1.1 Create main data-sync page.tsx with layout ✅
- [x] 10.1.2 Create OverviewPanel component ✅

> **10.1.1 Description:**
> Create/update `src/app/admin/data-sync/page.tsx`:
> - Use dark theme (slate-900 background)
> - Grid layout with sections: Overview, Analytics, Bulk Import, Gap Management
> - Fetch initial data server-side for faster load
> - Match styling from Content Manager page (cards, spacing, typography)
> - Add loading skeleton while data loads
> - Import and compose all sub-components
>
> **10.1.2 Description:**
> Create `src/app/admin/data-sync/components/OverviewPanel.tsx`:
> - Card displaying total content count with visual bar
> - Breakdown: Movies vs TV Series with counts
> - Sync status indicator (colored dot + text)
> - Last sync time with "X hours ago" format
> - Next scheduled sync time
> - Uses glassmorphism styling for premium look

---

### 10.2 Analytics Section
- [x] 10.2.1 Create AnalyticsSection component with stat cards ✅
- [x] 10.2.2 Add simple visual indicators (no external chart libs) ✅

> **10.2.1 Description:**
> Create `src/app/admin/data-sync/components/AnalyticsSection.tsx`:
> - Grid of stat cards showing:
>   - Success Rate: Percentage of successful imports (green/amber/red based on value)
>   - Failed Imports: Count with error icon
>   - Skipped (Duplicates): Count with info icon
>   - Pending Gaps: Count with warning icon
> - Each card is clickable to navigate to detailed view
> - Fetch data from `/api/sync/stats` endpoint
>
> **10.2.2 Description:**
> Add CSS-based visual indicators to AnalyticsSection:
> - Progress bars using CSS (no chart libraries to keep bundle small)
> - Color-coded rings for percentages (CSS radial gradients)
> - Trend indicators (↑↓) comparing to previous period
> - Responsive design for mobile viewing
> - Keep dependencies minimal - pure CSS/Tailwind animations

---

### 10.3 Sync History Component
- [x] 10.3.1 Create SyncHistory component with log list ✅
- [x] 10.3.2 Add pagination and filtering ✅

> **10.3.1 Description:**
> Create `src/app/admin/data-sync/components/SyncHistory.tsx`:
> - Table/list showing recent sync operations from sync_logs
> - Columns: Date/Time, Type, Status, Summary (added/skipped/failed)
> - Status with color badges: green (completed), red (failed), amber (running)
> - Expandable rows to show error details if any
> - "View All" link to full history page
>
> **10.3.2 Description:**
> Add pagination and filtering to SyncHistory:
> - Filter dropdown: All, Cron, Manual, Bulk Import, Gap Fill
> - Status filter: All, Completed, Failed, Running
> - Pagination with page size selector (10/25/50)
> - URL query params for shareable filtered views
> - Loading state during filter changes

---

## Phase 11: Bulk Import Enhancement

### 11.1 Import Filter Form
- [x] 11.1.1 Create BulkImportCenter component layout ✅
- [x] 11.1.2 Create ImportFilters form with content type and country ✅

> **11.1.1 Description:**
> Create `src/app/admin/data-sync/components/BulkImportCenter.tsx`:
> - Container component that holds the entire bulk import UI
> - Two-column layout: Filters on left, Preview on right
> - Card styling with dark theme
> - Collapsible sections for advanced options
> - State management for form values and preview data
>
> **11.1.2 Description:**
> Create `src/app/admin/data-sync/components/ImportFilters.tsx`:
> - Content Type: Radio buttons (Movie, TV Series, Both)
> - Origin Country: Multi-select checkboxes with popular countries
>   - Korea, Japan, China, Thailand, Turkey, India, USA, UK
>   - Collapsed "More countries..." section for others
> - Store country codes (KR, JP, CN, etc.) in state
> - Add "Clear All" button to reset filters
> - Dark theme form styling with proper focus states

---

### 11.2 Import Filter Form (Date & Genre)
- [x] 11.2.1 Add date range filter (year/month picker) ✅
- [x] 11.2.2 Add genre multi-select filter ✅

> **11.2.1 Description:**
> Extend ImportFilters.tsx with date range filter:
> - Mode selector: Year Only, Year + Month, Custom Range
> - For Year Only: Simple year dropdown (2020-2026)
> - For Year + Month: Year + Month dropdowns
> - For Custom Range: From/To date inputs
> - Store as `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`
> - Add clear button for date filter
>
> **11.2.2 Description:**
> Extend ImportFilters.tsx with genre filter:
> - Fetch genres from TMDB API or use cached list
> - Common genres: Drama, Romance, Action, Comedy, Thriller, Horror, Sci-Fi, Fantasy
> - Multi-select checkboxes with search/filter
> - Selected genres shown as tags above the list
> - Store genre IDs (TMDB format) in state

---

### 11.3 Import Popularity Priority
- [x] 11.3.1 Add popularity priority slider ✅
- [x] 11.3.2 Add duplicate check toggle and update existing option ✅

> **11.3.1 Description:**
> Extend ImportFilters.tsx with popularity priority slider:
> - Label: "Popularity Priority" with explanation tooltip
> - Range slider from 0-100 (Low to High)
> - Visual indicator showing current value
> - Explanation: "Higher = Fetch most popular content first"
> - **CRITICAL**: This is sorting priority, NOT a filter. All matching content is imported, just ordered by popularity.
>
> **11.3.2 Description:**
> Extend ImportFilters.tsx with import options:
> - Checkbox: "Check for duplicates before import" (default: true)
> - Checkbox: "Update existing content if found" (default: false)
> - These options control import behavior
> - Update existing: If true, re-import even if TMDB ID exists (for metadata refresh)
> - Store these as part of import configuration

---

### 11.4 Import Preview System
- [x] 11.4.1 Create /api/import/preview endpoint ✅
- [x] 11.4.2 Create ImportPreview component ✅

> **11.4.1 Description:**
> Create `src/app/api/import/preview/route.ts`:
> - `POST` handler accepting filter configuration
> - Query TMDB Discover API with filters (first 2-3 pages only for speed)
> - Cross-reference results with existing content table
> - Return: `{ estimated_total, duplicates, new_content, sample_items[] }`
> - Sample items: First 10 items with title, year, poster, popularity, isDuplicate flag
> - Cache TMDB results briefly to avoid re-fetching on minor filter changes
>
> **11.4.2 Description:**
> Create `src/app/admin/data-sync/components/ImportPreview.tsx`:
> - Display preview results in card format
> - Stats: Estimated total, Potential duplicates, New content count
> - Sample items list with poster thumbnails and duplicate badges
> - "Loading Preview..." state with skeleton
> - "Preview Import" button that fetches preview
> - Refresh automatically when filters change (debounced)

---

### 11.5 Import Job Execution
- [x] 11.5.1 Create /api/import/start endpoint ✅
- [x] 11.5.2 Add import job to queue and background processing ✅

> **11.5.1 Description:**
> Create `src/app/api/import/start/route.ts`:
> - `POST` handler accepting filter configuration
> - Validate configuration (at least one filter required)
> - Create new row in `import_jobs` table with status 'pending'
> - Return job_id to client for status tracking
> - If "immediate" mode: Start processing first batch inline
> - Log to sync_logs as "bulk_import" type
>
> **11.5.2 Description:**
> Implement background processing logic in `src/lib/services/import.service.ts`:
> - `processImportJob(jobId)` - Main processing function
> - Query TMDB Discover API page by page
> - For each item: Check duplicate, fetch details, upsert to content table
> - Update import_jobs.progress after each batch (20 items)
> - Handle rate limiting with delays (250ms between requests)
> - Mark job as 'completed' or 'failed' when done
> - Can be called from API route or GitHub Actions for long jobs

---

### 11.6 Import Queue UI
- [x] 11.6.1 Create ImportQueue component showing active jobs ✅
- [x] 11.6.2 Add job control actions (pause, resume, cancel) ✅

> **11.6.1 Description:**
> Create `src/app/admin/data-sync/components/ImportQueue.tsx`:
> - List view showing all import_jobs ordered by priority
> - For each job: Name, Status badge, Progress bar, Stats (imported/failed/skipped)
> - Running jobs at top with animated progress
> - Pending jobs with ETA based on current job speed
> - Completed/Failed jobs at bottom (collapsible)
> - Auto-refresh every 5 seconds for running jobs
>
> **11.6.2 Description:**
> Add job control actions to ImportQueue:
> - Pause button: Sets status to 'paused', stops processing
> - Resume button: Sets status to 'running', continues from last position
> - Cancel button: Sets status to 'cancelled', removes pending items
> - Priority up/down: Reorder pending jobs
> - Create API endpoints: `/api/import/jobs/[id]/pause`, `/resume`, `/cancel`
> - Confirmation dialogs for destructive actions

---

## Phase 12: Gap Detection & Filling

### 12.1 Gap Detection Service
- [x] 12.1.1 Create gap detection service with detection algorithms ✅
- [x] 12.1.2 Create /api/gaps/detect endpoint ✅

> **12.1.1 Description:**
> Create `src/lib/services/gap.service.ts` with detection algorithms:
> - `detectMetadataGaps()` - Find content with missing poster, overview, etc.
> - `detectPopularityGaps()` - Query TMDB popular, find missing in DB
> - `detectTemporalGaps()` - Find date ranges with sparse content
> - `calculatePriorityScore(gap)` - Score based on popularity × recency
> - Each function returns array of gaps with type, tmdb_id, priority_score
> - Use batch queries for efficiency
>
> **12.1.2 Description:**
> Create `src/app/api/gaps/detect/route.ts`:
> - `POST` handler that runs gap detection
> - Accept optional `type` param to run specific detection only
> - Call gap.service.ts functions
> - Insert/update results in gap_registry table
> - Return summary: counts by type, total new gaps found
> - Log to sync_logs as "gap_detection" type

---

### 12.2 Gap Management UI
- [x] 12.2.1 Create GapManagement component with gap list ✅
- [x] 12.2.2 Add gap fill actions ✅

> **12.2.1 Description:**
> Create `src/app/admin/data-sync/components/GapManagement.tsx`:
> - Summary cards: Total gaps, By type (Metadata, Popularity, Temporal)
> - Table showing unresolved gaps: TMDB ID, Type, Priority Score, Detected At, Attempts
> - Filter by gap type
> - Sort by priority score or date
> - Search by TMDB ID
> - Pagination for large gap lists
>
> **12.2.2 Description:**
> Add gap fill actions to GapManagement:
> - "Fill Gap" button per row: Attempts to import that specific content
> - "Fill All" button: Start batch fill job for all unresolved gaps
> - "Fill Top 50" button: Fill highest priority gaps
> - "Run Detection" button: Trigger new gap detection scan
> - API endpoints: `/api/gaps/fill` (POST with gap IDs or options)
> - Show progress when filling is in progress

---

### ~~12.3 Gap Auto-Fill Scheduler~~ SKIPPED ❌
- [~] 12.3.1 Create gap fill job in GitHub Actions - SKIPPED
- [~] 12.3.2 Create gap fill processing logic - SKIPPED

> **Reason for skipping:** Auto-fill is removed. Gap filling is now manual-only for metadata gaps. Bulk Import (Phase 11) handles all new content imports with full control.
> 
> **Phase 12 Simplified to:** Metadata gap detection only - finds existing content with missing posters/descriptions and allows manual fixing per item.

---

## ~~Phase 13: Import Presets System~~ SKIPPED ❌

> **Reason for skipping:** Presets are one-time use. Once Korean dramas 2024 are imported, that preset is never needed again. Unnecessary complexity for an admin console.

### ~~13.1 Preset CRUD Operations~~
- [~] 13.1.1 Create preset API endpoints - SKIPPED
- [~] 13.1.2 Create PresetManager component - SKIPPED

> **13.1.1 Description:**
> Create preset API endpoints:
> - `GET /api/import/presets` - List all presets for current user
> - `POST /api/import/presets` - Create new preset with name and configuration
> - `PUT /api/import/presets/[id]` - Update preset name or configuration
> - `DELETE /api/import/presets/[id]` - Delete a preset
> - Update `last_used_at` and increment `use_count` when preset is applied
>
> **13.1.2 Description:**
> Create `src/app/admin/data-sync/components/PresetManager.tsx`:
> - Dropdown to select saved presets
> - "Apply" button to load preset configuration into import filters
> - "Save Current" button to save current filter state as new preset
> - Preset list showing: Name, Description, Last Used, Use Count
> - Edit/Delete icons for each preset
> - Modal for create/edit with name and description inputs

---

### 13.2 Preset System Polish
- [ ] 13.2.1 Add default system presets
- [ ] 13.2.2 Integrate presets with BulkImportCenter

> **13.2.1 Description:**
> Create default system presets (not user-editable):
> - "K-Drama 2024" - TV, Korea, 2024, Drama/Romance
> - "K-Drama 2025" - TV, Korea, 2025, Drama/Romance
> - "Asian Cinema Mix" - Both, [KR,JP,CN,TH], All years
> - "Hollywood Blockbusters" - Movie, USA, High Popularity
> - Insert these with `created_by: NULL` to mark as system presets
> - System presets appear at top of dropdown with different styling
>
> **13.2.2 Description:**
> Integrate PresetManager into BulkImportCenter:
> - Add preset selector at top of filter form
> - When preset selected, populate all filter fields
> - "Modified" indicator when filters differ from selected preset
> - Quick save button to update current preset with changes
> - Keyboard shortcut (Ctrl+S) to save as preset

---

## ~~Phase 14: Caching Integration~~ SKIPPED ❌

> **Reason for skipping:** Admin console needs **real-time data**, not cached data. Caching would show stale sync status, content counts, etc. which defeats the purpose of an admin dashboard.

### ~~14.1 Cache Content API Routes~~
- [ ] 14.1.1 Add caching to GET /api/content list route
- [ ] 14.1.2 Add caching to GET /api/content/[id] detail route

> **14.1.1 Description:**
> Modify `src/app/api/content/route.ts` GET handler:
> - Generate cache key from query params (page, limit, type, status, search, sort)
> - Check Redis cache first using CacheService.getContentList(key)
> - If cache hit: Return cached response immediately
> - If cache miss: Query database, store in cache with 5-min TTL, return
> - Add `X-Cache: HIT` or `X-Cache: MISS` header for debugging
>
> **14.1.2 Description:**
> Modify `src/app/api/content/[id]/route.ts` GET handler:
> - Check Redis cache using CacheService.getContent(id)
> - If cache hit: Return cached response
> - If cache miss: Query database, cache for 15 mins, return
> - Add X-Cache header
> - For related data (cast, videos), cache separately or as part of content

---

### 14.2 Cache Invalidation on Updates
- [ ] 14.2.1 Invalidate cache on content create/update/delete
- [ ] 14.2.2 Add cache stats endpoint

> **14.2.1 Description:**
> Modify content mutation endpoints to invalidate cache:
> - POST (create): Invalidate all content lists (new item affects pagination)
> - PUT/PATCH (update): Invalidate specific content + all lists
> - DELETE: Invalidate specific content + all lists
> - Call CacheService.invalidateContent(id) and CacheService.invalidateContentLists()
> - Do invalidation after successful database operation
>
> **14.2.2 Description:**
> Create `/api/cache/stats/route.ts`:
> - GET handler returning cache statistics
> - Total cached items (approximate using Redis DBSIZE)
> - Memory usage
> - Hit/miss ratio (if tracking)
> - List of cache key patterns
> - Add "Clear Cache" action for admins

---

### 14.3 Cache People API Routes
- [ ] 14.3.1 Add caching to GET /api/people routes
- [ ] 14.3.2 Add cache invalidation for people mutations

> **14.3.1 Description:**
> Modify `src/app/api/people/route.ts` GET handler:
> - Generate cache key from query params (page, limit, department, search, sort)
> - Check Redis cache using CacheService.getPeopleList(key)
> - Cache with 5-min TTL
> - Add X-Cache header
> Similarly cache individual person details with 15-min TTL
>
> **14.3.2 Description:**
> Modify people mutation endpoints:
> - POST/PUT/DELETE: Invalidate relevant caches
> - CacheService.invalidatePerson(id)
> - CacheService.invalidatePeopleLists()
> - Ensure cache consistency when people are imported via TMDB sync

---

## ~~Phase 15: Server-Side Rendering Migration~~ SKIPPED ❌

> **Reason for skipping:** Admin console is behind authentication with no public pages. No SEO needed. Client-side rendering is perfectly fine for internal tools.

### ~~15.1 Dashboard SSR~~
- [ ] 15.1.1 Convert dashboard page to Server Component
- [ ] 15.1.2 Add ISR (Incremental Static Regeneration)

> **15.1.1 Description:**
> Modify `src/app/admin/dashboard/page.tsx`:
> - Remove 'use client' directive
> - Convert to async function component
> - Fetch dashboard stats directly in component (no useEffect)
> - Import database service functions directly
> - Create `DashboardUI.tsx` as client component for interactive elements
> - Pass fetched data as props to client component
>
> **15.1.2 Description:**
> Add ISR to dashboard:
> - Export `const revalidate = 60` for 60-second revalidation
> - Dashboard will be statically generated but refresh every minute
> - Reduces database load while keeping data relatively fresh
> - Add "Last updated X seconds ago" indicator
> - Manual refresh button that forces client-side refetch

---

### 9.2 Supabase pg_cron Setup
- [x] 9.2.1 Enable pg_cron extension and create helper functions ✅
- [x] 9.2.2 Schedule daily sync job (21:30 UTC / 3 AM IST) ✅

### 15.2 Content Manager SSR
- [ ] 15.2.1 Convert content page to Server Component
- [ ] 15.2.2 Create ContentManagerUI client component

> **15.2.1 Description:**
> Modify `src/app/admin/content/page.tsx`:
> - Remove 'use client' directive
> - Add async and fetch content list server-side
> - Use searchParams for pagination and filtering
> - Pass initial data to client component
> - Benefit: Faster initial page load, SEO-friendly
>
> **15.2.2 Description:**
> Create `src/app/admin/content/ContentManagerUI.tsx`:
> - 'use client' component for interactivity
> - Receives `initialData` and `totalCount` as props
> - Handles search, filter, pagination changes client-side
> - Uses fetch API to update data when filters change
> - Maintains the existing UI but with better initial load

---

### 15.3 People Manager SSR
- [ ] 15.3.1 Convert people page to Server Component
- [ ] 15.3.2 Create PeopleManagerUI client component

> **15.3.1 Description:**
> Modify `src/app/admin/people/page.tsx`:
> - Remove 'use client' directive
> - Fetch people list server-side
> - Use searchParams for pagination and filtering
> - Pass initial data to client component
>
> **15.3.2 Description:**
> Create `src/app/admin/people/PeopleManagerUI.tsx`:
> - 'use client' component for interactivity
> - Receives `initialData` and `totalCount` as props
> - Handles department filter, search, pagination client-side
> - Maintains existing UI functionality

---

## Phase 16: Real-Time Updates

### 16.1 Content Real-Time Provider
- [ ] 16.1.1 Create ContentRealtimeProvider component
- [ ] 16.1.2 Integrate provider in admin layout

> **16.1.1 Description:**
> Create `src/app/admin/providers/ContentRealtimeProvider.tsx`:
> - 'use client' component wrapping children
> - Subscribe to Supabase Realtime for 'content' table changes
> - On INSERT/UPDATE/DELETE events, invalidate relevant cache
> - Optionally trigger UI refresh or show notification
> - Handle connection errors gracefully
> - Cleanup subscription on unmount
>
> **16.1.2 Description:**
> Modify `src/app/admin/layout.tsx`:
> - Import ContentRealtimeProvider
> - Wrap children with provider
> - Ensure provider only runs on client (use dynamic import if needed)
> - Test real-time updates by modifying content in another tab

---

### 16.2 Real-Time Notifications
- [ ] 16.2.1 Create toast notification system
- [ ] 16.2.2 Show real-time sync updates

> **16.2.1 Description:**
> Create simple toast notification component (no external library):
> - `src/components/ui/Toast.tsx` - Individual toast component
> - `src/components/ui/ToastContainer.tsx` - Container for stacking toasts
> - `src/lib/hooks/useToast.ts` - Hook for showing toasts
> - Toast types: success (green), error (red), info (blue), warning (amber)
> - Auto-dismiss after 5 seconds with progress bar
> - Manual dismiss on click
>
> **16.2.2 Description:**
> Integrate toasts with real-time updates:
> - When content is added: "New content added: {title}"
> - When sync completes: "Sync complete: X items imported"
> - When sync fails: "Sync failed: {error message}"
> - Subscribe to sync_jobs table for import progress updates
> - Keep notifications non-intrusive but informative

---

## Phase 17: Final Polish & Testing

### 17.1 Error Recovery Dashboard
- [ ] 17.1.1 Create ErrorRecovery component
- [ ] 17.1.2 Add retry functionality

> **17.1.1 Description:**
> Create `src/app/admin/data-sync/components/ErrorRecovery.tsx`:
> - List failed imports from gap_registry (with error details)
> - Group by error type: Network, Validation, Rate Limit, Other
> - Table: TMDB ID, Content Type, Error Message, Attempts, Last Error
> - Filter by error type
> - Sort by attempts or date
> - Summary stats at top
>
> **17.1.2 Description:**
> Add retry functionality to ErrorRecovery:
> - "Retry" button per item: Re-attempt import for that item
> - "Retry All Network Errors" button: Batch retry retryable errors
> - "Skip" button: Mark gap as resolved without importing
> - "Retry All" button with confirmation dialog
> - API endpoint: `/api/gaps/retry` accepting gap IDs

---

### 17.2 Performance Optimization
- [ ] 17.2.1 Add database indexes for common queries
- [ ] 17.2.2 Optimize API response payloads

> **17.2.1 Description:**
> Execute SQL to add performance indexes:
> - Content table: idx_content_type_status, idx_content_release_date, idx_content_popularity
> - People table: idx_people_known_for_department, idx_people_popularity
> - Import jobs: idx_import_jobs_status_priority
> - Test query performance before and after with EXPLAIN ANALYZE
>
> **17.2.2 Description:**
> Optimize API response sizes:
> - Content list: Only return essential fields (id, title, poster, type, status, year)
> - Full content details only on /api/content/[id]
> - Paginate all list endpoints (default 20, max 100)
> - Remove unused fields from responses
> - Add gzip compression in Next.js config if not already

---

### 17.3 Documentation & Cleanup
- [ ] 17.3.1 Update API documentation
- [ ] 17.3.2 Clean up unused code and files

> **17.3.1 Description:**
> Create/update API documentation:
> - Document all new endpoints in README or docs folder
> - Include request/response examples
> - Document environment variables needed
> - Add troubleshooting section for common issues
> - Update deployment instructions for Vercel
>
> **17.3.2 Description:**
> Clean up codebase:
> - Remove any unused components
> - Remove commented-out code
> - Remove old migration files if applied
> - Ensure .gitignore covers all sensitive files
> - Run TypeScript type check, fix any errors

---

## Phase 18: Verification & Deployment

### 18.1 End-to-End Testing
- [ ] 18.1.1 Test bulk import flow
- [ ] 18.1.2 Test gap detection and fill flow

> **18.1.1 Description:**
> Manual testing for bulk import:
> 1. Open Data Sync page, verify UI loads correctly
> 2. Configure filters: Type=TV, Country=Korea, Year=2024
> 3. Click Preview, verify estimated count and sample items
> 4. Click Start Import, verify job appears in queue
> 5. Monitor progress updates in real-time
> 6. Verify content appears in Content Manager after import
> 7. Test pause/resume functionality
>
> **18.1.2 Description:**
> Manual testing for gap detection:
> 1. Trigger gap detection from UI
> 2. Verify gaps appear in Gap Management section
> 3. Test "Fill Gap" for individual item
> 4. Test "Fill All" with small batch
> 5. Verify filled content appears in Content Manager
> 6. Verify gaps marked as resolved

---

### 18.2 Cache Verification
- [ ] 18.2.1 Test cache hit/miss behavior
- [ ] 18.2.2 Test cache invalidation

> **18.2.1 Description:**
> Test caching:
> 1. Clear cache, load Content Manager
> 2. Should see X-Cache: MISS in network headers
> 3. Reload page, should see X-Cache: HIT
> 4. Verify visually faster load time
> 5. Check cache stats endpoint shows data
>
> **18.2.2 Description:**
> Test cache invalidation:
> 1. Edit a content item, save
> 2. Reload Content Manager
> 3. Changes should appear immediately (cache was invalidated)
> 4. Verify cache stats show updated counts

---

### 18.3 Production Deployment
- [ ] 18.3.1 Deploy to Vercel and verify
- [ ] 18.3.2 Monitor and fix any production issues

> **18.3.1 Description:**
> Deploy to production:
> 1. Push all changes to main branch
> 2. Verify Vercel auto-deploys
> 3. Check build logs for errors
> 4. Verify environment variables are set in Vercel dashboard
> 5. Test all major features in production
> 6. Check Vercel Analytics for performance metrics
>
> **18.3.2 Description:**
> Monitor production:
> 1. Check Supabase logs for database errors
> 2. Check Vercel logs for API errors
> 3. Check Upstash Redis usage (stay under free tier limits)
> 4. Verify GitHub Actions runs complete successfully
> 5. Fix any issues discovered
> 6. Create walkthrough.md documenting completed work

---

## 📊 Progress Summary

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 8 | [ ] Pending | Infrastructure Foundation |
| Phase 9 | [ ] Pending | Sync Controller & Cron System |
| Phase 10 | [ ] Pending | Data Sync Dashboard UI |
| Phase 11 | [ ] Pending | Bulk Import Enhancement |
| Phase 12 | [ ] Pending | Gap Detection & Filling |
| Phase 13 | [ ] Pending | Import Presets System |
| Phase 14 | [ ] Pending | Caching Integration |
| Phase 15 | [ ] Pending | Server-Side Rendering Migration |
| Phase 16 | [ ] Pending | Real-Time Updates |
| Phase 17 | [ ] Pending | Final Polish & Testing |
| Phase 18 | [ ] Pending | Verification & Deployment |

---

## 🔗 Related Documents

- [Data Sync Enhancement Agent Guide](file:///C:/Users/Krushna/.gemini/antigravity/brain/9bc60852-85b0-4e2d-89da-f9e2059aa762/Data_Sync_Enhancement_Agent_Guide.md) - Original user requirements
- [Option B Architecture Migration Plan](file:///d:/GDVG%20Projects/GDVG-Admin-Console/archives/Option_B_Architecture_Migration_Plan.md) - Technical architecture details
- Main project: `d:\GDVG Projects\GDVG-Admin-Console`

---

*Last Updated: 2026-01-27*  
*Total Sub-Tasks: 68*  
*Estimated Total Effort: 25-35 hours (at 1-2 items per session)*
