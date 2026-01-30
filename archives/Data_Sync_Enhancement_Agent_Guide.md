# Data Sync Enhancement Agent Guide
## GDVG Admin Console - Comprehensive Implementation Reference

> **Purpose:** This document serves as a complete reference for AI agents (Claude Opus 4.5 Thinking / Gemini) to implement the enhanced Data Sync, Bulk Import, Gap Filling, and Cron Controller features for the GDVG Admin Console.

---

## 📋 Executive Summary

The user requires a comprehensive overhaul of the **Data Sync** infrastructure with the following core objectives:

1. **Fix Content Count Discrepancy** - Only 697 items showing; bugs during import caused data gaps
2. **UI/UX Alignment** - Data Sync section needs to match the modern dark theme of the application
3. **Gap Filling System** - Intelligent detection and recovery of skipped/missed content
4. **Cron Controller** - Dashboard-based pause/resume for GitHub Actions sync jobs
5. **Enhanced Bulk Import** - Rich filtering and prioritization for targeted content imports

---

## 🔍 Context & Background

### Current State

| Metric | Value | Issue |
|--------|-------|-------|
| Content in DB | ~697 | Significantly lower than expected |
| Import Script | Ran with bugs | Fixed midway, causing gaps |
| Data Sync UI | Basic styling | Doesn't match modern app design |
| Analytics | Poor quality | Needs significant improvement |
| Duplicate Handling | Skips | Doesn't attempt to fill gaps later |

### Root Cause Analysis

When the import script ran, bugs were being fixed **during execution**, resulting in:
- Incomplete imports for some TMDB IDs
- Skipped content that was never retried
- Inconsistent metadata across content items
- Potential orphan records or malformed entries

### Goal State

A robust, self-healing content sync system that:
- Automatically detects and fills content gaps
- Allows manual control over sync operations
- Provides rich bulk import capabilities
- Matches the premium UI aesthetic of the application

---

## 🎯 Core Requirements (User's Explicit Demands)

### Requirement 1: Data Sync UI Improvements

**Problem:** Data Sync section has poor styling and analytics display.

**Solution:** Complete redesign to match the application's design language.

**UI Specifications:**
- **Background:** Slate-900 (dark mode)
- **Cards:** Glassmorphism effect with subtle borders
- **Accent Colors:**
  - Success: Green-500
  - Warning: Amber-500
  - Error: Red-500
  - Primary: Blue-500
- **Typography:** Inter font, consistent sizing
- **Spacing:** 16px grid system
- **Animations:** Smooth micro-interactions

**Required Components:**
```
┌─────────────────────────────────────────────────────────────┐
│                     DATA SYNC DASHBOARD                      │
├──────────────────┬──────────────────┬──────────────────────┤
│  Total Content   │  Sync Status     │   Quick Actions      │
│  ▓▓▓▓▓ 2,847     │  ✓ Active        │  [Sync Now] [Pause]  │
│  Movies: 1,234   │  Last: 2h ago    │                      │
│  TV: 1,613       │  Next: in 4h     │                      │
├──────────────────┴──────────────────┴──────────────────────┤
│                    ANALYTICS SECTION                         │
│  [Success Rate Chart] [Import Volume] [Error Distribution]  │
├─────────────────────────────────────────────────────────────┤
│                    BULK IMPORT CENTER                        │
├─────────────────────────────────────────────────────────────┤
│                    GAP MANAGEMENT                            │
└─────────────────────────────────────────────────────────────┘
```

---

### Requirement 2: Gap Filling / Skip Recovery System

**Problem:** When content is skipped (duplicate check), it's never retried. After importing latest content, most new runs result in skips.

**Solution:** Intelligent gap detection and scheduled recovery.

**Gap Detection Types:**

| Type | Description | Detection Method |
|------|-------------|------------------|
| **Sequential Gaps** | Missing TMDB IDs in sequences | Compare DB IDs vs TMDB ID ranges |
| **Popularity Gaps** | Popular content missing from DB | Query TMDB popular endpoint, cross-reference |
| **Temporal Gaps** | Missing content from date ranges | Check release dates vs DB coverage |
| **Metadata Gaps** | Content with incomplete data | Find entries missing poster/overview/etc. |

**Gap Filling Algorithm:**

```
1. DAILY: Run gap analysis
   └─> Detect all gap types
   └─> Score gaps by priority (popularity × recency)

2. FOR EACH skipped content during sync:
   └─> Log to gap_registry table
   └─> Mark reason (duplicate, error, rate_limit)

3. WEEKLY: Execute gap fill job
   └─> Sort gaps by priority score
   └─> Fetch fresh data from TMDB
   └─> Apply duplicate check (by content, not just skip)
   └─> Fill gaps respecting rate limits

4. REPORT: Surface gaps in dashboard
   └─> Allow manual triggering of fills
   └─> Show fill progress
```

**Database Schema for Gap Tracking:**

```sql
CREATE TABLE gap_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tmdb_id INTEGER NOT NULL,
    content_type VARCHAR(20) NOT NULL, -- 'movie' | 'tv_series'
    gap_type VARCHAR(30) NOT NULL, -- 'sequential' | 'popularity' | 'temporal' | 'metadata'
    priority_score DECIMAL(5,2) DEFAULT 0,
    skip_reason TEXT,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    filled_at TIMESTAMP WITH TIME ZONE,
    fill_attempts INTEGER DEFAULT 0,
    last_attempt_error TEXT,
    is_resolved BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_gap_registry_unresolved ON gap_registry(is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX idx_gap_registry_priority ON gap_registry(priority_score DESC);
```

---

### Requirement 3: Cron Controller (Pause/Resume)

**Problem:** Need dashboard control to pause/resume automated sync jobs without modifying GitHub Actions.

**Solution:** Dashboard-based flag that the sync job checks before executing.

**User Flow:**
```
DASHBOARD                             GITHUB ACTIONS
   │                                       │
   │  ┌──────────────────────┐             │
   │  │ Cron Status: ACTIVE  │             │
   │  │ [PAUSE] button       │             │
   │  └──────────────────────┘             │
   │                                       │
   │──(User clicks PAUSE)───────────────►  │
   │                                       │
   │  ┌──────────────────────┐             │
   │  │ Cron Status: PAUSED  │             │
   │  │ [RESUME] button      │             │
   │  └──────────────────────┘             │
   │                                       │
   │                          ────(Cron triggers)───►
   │                                       │
   │                          ◄───(API check: is_paused?)───
   │                                       │
   │                          ────(If paused: exit early)───►
   │                                       │
```

**Database Schema:**

```sql
CREATE TABLE sync_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Insert default settings
INSERT INTO sync_settings (setting_key, setting_value) VALUES
('cron_status', '{"is_paused": false, "paused_at": null, "paused_by": null}'),
('sync_schedule', '{"frequency": "every_6_hours", "cron_expression": "0 */6 * * *"}'),
('last_run', '{"started_at": null, "completed_at": null, "status": null, "summary": {}}');
```

**API Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sync/status` | GET | Get current sync status & settings |
| `/api/sync/pause` | POST | Pause the cron job |
| `/api/sync/resume` | POST | Resume the cron job |
| `/api/sync/trigger` | POST | Manually trigger a sync |
| `/api/sync/history` | GET | Get sync run history |

**GitHub Actions Modification:**

```yaml
# In the sync job, add this check at the start:
jobs:
  sync:
    steps:
      - name: Check if sync is paused
        run: |
          STATUS=$(curl -s "${{ secrets.APP_URL }}/api/sync/status")
          IS_PAUSED=$(echo $STATUS | jq -r '.is_paused')
          if [ "$IS_PAUSED" = "true" ]; then
            echo "Sync is paused. Exiting."
            exit 0
          fi
      # ... rest of sync job
```

---

### Requirement 4: Enhanced Bulk Import Section

**Problem:** Basic import lacks customization for targeted content sourcing.

**Solution:** Rich filtering interface with preview and duplicate detection.

**Filter Options:**

| Filter | Type | Description |
|--------|------|-------------|
| **Content Type** | Select | `movie`, `tv_series`, `all` |
| **Origin Country** | Multi-select | ISO country codes (KR, US, JP, IN, CN, UK, etc.) |
| **Release Date** | Range Picker | Year-wise, Month-wise, or Both |
| **Genres** | Multi-select | Action, Romance, Comedy, Drama, Thriller, etc. |
| **Popularity** | Priority Slider | Higher = fetch most popular first (NOT a filter) |
| **Include Existing** | Toggle | Whether to update existing content or skip |

**UI Layout for Bulk Import:**

```
┌─────────────────────────────────────────────────────────────┐
│                   BULK IMPORT CENTER                         │
├─────────────────────────────────────────────────────────────┤
│  Content Type: [● Movie ○ TV Series ○ Both]                 │
│                                                              │
│  Origin Country:                                             │
│  [ Korea ✓ ] [ Japan ] [ USA ✓ ] [ India ] [ + More... ]    │
│                                                              │
│  Release Period:                                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ From: Jan 2024  │  │ To: Dec 2024    │                   │
│  └─────────────────┘  └─────────────────┘                   │
│                                                              │
│  Genres:                                                     │
│  [ Drama ✓ ] [ Romance ✓ ] [ Action ] [ Thriller ] [ ... ]  │
│                                                              │
│  Popularity Priority:                                        │
│  Low ├────────●────────┤ High                               │
│       (Fetch most popular content first)                     │
│                                                              │
│  ☑ Check for duplicates before import                       │
│  ☐ Update existing content if found                         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ PREVIEW                                                 │ │
│  │ Estimated: ~2,450 items                                 │ │
│  │ Potential duplicates: 127                               │ │
│  │ New content: 2,323                                      │ │
│  │                                                         │ │
│  │ Sample Items:                                           │ │
│  │ • Squid Game (2021) ★8.5 [Duplicate]                    │ │
│  │ • Moving (2023) ★9.1 [New]                              │ │
│  │ • The Glory (2022) ★8.9 [New]                           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Preview Import]          [Start Import]                    │
└─────────────────────────────────────────────────────────────┘
```

**Popularity as PRIORITY (Important Clarification):**

The user explicitly stated: **"popularity as priority, not filter"**

This means:
- Do NOT exclude low-popularity content
- DO sort/prioritize by popularity during import
- Fetch highest popularity content FIRST
- Continue to lower popularity content until all filtered content is imported

**Implementation Logic:**

```javascript
// TMDB API query with popularity sorting
const fetchContent = async (filters) => {
  const { contentType, countries, dateRange, genres, popularityPriority } = filters;
  
  // Build TMDB discover query
  const params = {
    sort_by: `popularity.${popularityPriority > 50 ? 'desc' : 'asc'}`,
    with_origin_country: countries.join('|'),
    'primary_release_date.gte': dateRange.from,
    'primary_release_date.lte': dateRange.to,
    with_genres: genres.join(','),
    page: 1
  };
  
  // Fetch all pages, processing highest popularity first
  let allContent = [];
  let page = 1;
  while (true) {
    const response = await tmdbDiscover(contentType, { ...params, page });
    allContent.push(...response.results);
    if (page >= response.total_pages) break;
    page++;
  }
  
  return allContent;
};
```

---

## ✨ Enhanced Features (Recommended Additions)

### A. Import Templates / Presets

Allow users to save and reuse common import configurations.

**Database Schema:**

```sql
CREATE TABLE import_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    configuration JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    use_count INTEGER DEFAULT 0
);
```

**Preset Examples:**
- "K-Drama 2024" → `{ type: 'tv_series', countries: ['KR'], year: 2024 }`
- "Hollywood Blockbusters" → `{ type: 'movie', countries: ['US'], popularityPriority: 100 }`
- "Asian Cinema Mix" → `{ type: 'all', countries: ['KR', 'JP', 'CN', 'TH'] }`

---

### B. Import Queue Management

For large imports, provide a queue system with progress tracking.

**Database Schema:**

```sql
CREATE TABLE import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    configuration JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'running' | 'paused' | 'completed' | 'failed'
    progress JSONB DEFAULT '{"current": 0, "total": 0, "success": 0, "failed": 0, "skipped": 0}',
    priority INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_log TEXT[]
);
```

**Queue UI:**
```
┌────────────────────────────────────────────────────────────┐
│  IMPORT QUEUE                                               │
├────────────────────────────────────────────────────────────┤
│  1. [RUNNING] K-Drama 2024 Import                           │
│     ████████████░░░░░░ 456/890 (51%)                       │
│     ✓ 432 imported | ✗ 12 failed | ⊘ 12 skipped            │
│     [PAUSE] [CANCEL]                                        │
│                                                             │
│  2. [PENDING] Hollywood Action Films                        │
│     Waiting... (ETA: ~15 min)                              │
│     [↑ PRIORITY] [CANCEL]                                   │
│                                                             │
│  3. [PAUSED] J-Drama Collection                             │
│     ████░░░░░░░░░░░░░░ 123/567 (22%)                       │
│     [RESUME] [CANCEL]                                       │
└────────────────────────────────────────────────────────────┘
```

---

### C. Sync History & Logs

Detailed logging of all sync operations for debugging and analytics.

**Database Schema:**

```sql
CREATE TABLE sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_type VARCHAR(30) NOT NULL, -- 'cron' | 'manual' | 'bulk_import' | 'gap_fill'
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL, -- 'running' | 'completed' | 'failed' | 'cancelled'
    summary JSONB DEFAULT '{}',
    -- Example summary: {"total": 100, "added": 45, "updated": 30, "skipped": 20, "failed": 5}
    error_details TEXT[],
    triggered_by UUID REFERENCES auth.users(id),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_sync_logs_date ON sync_logs(started_at DESC);
```

---

### D. Error Recovery Dashboard

Centralized view for handling failed imports with retry capabilities.

**UI Concept:**
```
┌────────────────────────────────────────────────────────────┐
│  ERROR RECOVERY                                             │
├────────────────────────────────────────────────────────────┤
│  Failed Imports: 47                    [RETRY ALL]          │
├─────────────────┬────────────────────────────┬─────────────┤
│  Content        │  Error                     │  Action     │
├─────────────────┼────────────────────────────┼─────────────┤
│  ❌ TMDB#12345  │  Rate limit exceeded       │  [Retry]    │
│  ❌ TMDB#12346  │  Invalid poster URL        │  [Skip]     │
│  ❌ TMDB#12347  │  Network timeout           │  [Retry]    │
│  ❌ TMDB#12348  │  Missing required field    │  [View]     │
│  ... 43 more    │                            │             │
└─────────────────┴────────────────────────────┴─────────────┘

Error Categories:
• Network Errors: 23 (retryable)
• Validation Errors: 15 (needs review)
• Rate Limit: 9 (auto-scheduled for retry)
```

---

## 🗄️ Complete Database Schema

Here's the combined schema for all new tables:

```sql
-- ============================================================
-- DATA SYNC ENHANCEMENT SCHEMA
-- ============================================================

-- 1. Sync Settings (for cron controller & global settings)
CREATE TABLE IF NOT EXISTS sync_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- 2. Gap Registry (for tracking missing/skipped content)
CREATE TABLE IF NOT EXISTS gap_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tmdb_id INTEGER NOT NULL,
    content_type VARCHAR(20) NOT NULL,
    gap_type VARCHAR(30) NOT NULL,
    priority_score DECIMAL(5,2) DEFAULT 0,
    skip_reason TEXT,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    filled_at TIMESTAMP WITH TIME ZONE,
    fill_attempts INTEGER DEFAULT 0,
    last_attempt_error TEXT,
    is_resolved BOOLEAN DEFAULT FALSE,
    UNIQUE(tmdb_id, content_type)
);

-- 3. Import Jobs (for queue management)
CREATE TABLE IF NOT EXISTS import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    configuration JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    progress JSONB DEFAULT '{"current": 0, "total": 0, "success": 0, "failed": 0, "skipped": 0}',
    priority INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_log TEXT[]
);

-- 4. Import Presets (for saved configurations)
CREATE TABLE IF NOT EXISTS import_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    configuration JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    use_count INTEGER DEFAULT 0
);

-- 5. Sync Logs (for history & debugging)
CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_type VARCHAR(30) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL,
    summary JSONB DEFAULT '{}',
    error_details TEXT[],
    triggered_by UUID REFERENCES auth.users(id),
    metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gap_registry_unresolved ON gap_registry(is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_gap_registry_priority ON gap_registry(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_date ON sync_logs(started_at DESC);

-- RLS Policies
ALTER TABLE sync_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gap_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write
CREATE POLICY "Authenticated users can manage sync_settings" ON sync_settings FOR ALL USING (true);
CREATE POLICY "Authenticated users can manage gap_registry" ON gap_registry FOR ALL USING (true);
CREATE POLICY "Authenticated users can manage import_jobs" ON import_jobs FOR ALL USING (true);
CREATE POLICY "Authenticated users can manage import_presets" ON import_presets FOR ALL USING (true);
CREATE POLICY "Authenticated users can manage sync_logs" ON sync_logs FOR ALL USING (true);

-- Insert default sync settings
INSERT INTO sync_settings (setting_key, setting_value) VALUES
('cron_status', '{"is_paused": false, "paused_at": null, "paused_by": null}'::jsonb),
('sync_schedule', '{"frequency": "every_6_hours", "cron_expression": "0 */6 * * *"}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
```

---

## 🔌 API Endpoint Specifications

### Sync Control Endpoints

| Endpoint | Method | Request Body | Response |
|----------|--------|--------------|----------|
| `GET /api/sync/status` | GET | - | `{ is_paused, last_run, next_run, stats }` |
| `POST /api/sync/pause` | POST | - | `{ success, paused_at }` |
| `POST /api/sync/resume` | POST | - | `{ success, resumed_at }` |
| `POST /api/sync/trigger` | POST | `{ type: 'full' \| 'incremental' }` | `{ job_id, started_at }` |

### Bulk Import Endpoints

| Endpoint | Method | Request Body | Response |
|----------|--------|--------------|----------|
| `POST /api/import/preview` | POST | `{ filters }` | `{ estimated_count, duplicates, sample_items }` |
| `POST /api/import/start` | POST | `{ filters, options }` | `{ job_id, status }` |
| `GET /api/import/jobs` | GET | - | `[ { job_id, status, progress, ... } ]` |
| `POST /api/import/jobs/:id/pause` | POST | - | `{ success }` |
| `POST /api/import/jobs/:id/resume` | POST | - | `{ success }` |
| `DELETE /api/import/jobs/:id` | DELETE | - | `{ success }` |

### Gap Management Endpoints

| Endpoint | Method | Request Body | Response |
|----------|--------|--------------|----------|
| `GET /api/gaps/analyze` | GET | - | `{ gaps_by_type, total_count, top_priority }` |
| `POST /api/gaps/fill` | POST | `{ gap_type?, limit? }` | `{ job_id, gaps_to_fill }` |
| `GET /api/gaps/registry` | GET | `?resolved=false&type=...` | `[ { gap_details } ]` |

### Presets Endpoints

| Endpoint | Method | Request Body | Response |
|----------|--------|--------------|----------|
| `GET /api/import/presets` | GET | - | `[ { preset } ]` |
| `POST /api/import/presets` | POST | `{ name, config }` | `{ preset_id }` |
| `PUT /api/import/presets/:id` | PUT | `{ name, config }` | `{ success }` |
| `DELETE /api/import/presets/:id` | DELETE | - | `{ success }` |

---

## 📊 UI Component Structure

```
/src/app/admin/data-sync/
├── page.tsx                    # Main Data Sync Dashboard
├── components/
│   ├── OverviewPanel.tsx       # Stats cards and quick metrics
│   ├── SyncController.tsx      # Pause/Resume/Trigger buttons
│   ├── AnalyticsSection.tsx    # Charts and graphs
│   ├── BulkImportCenter.tsx    # Main import configuration UI
│   ├── ImportFilters.tsx       # Filter form components
│   ├── ImportPreview.tsx       # Preview results display
│   ├── ImportQueue.tsx         # Queue management
│   ├── GapManagement.tsx       # Gap detection and filling UI
│   ├── ErrorRecovery.tsx       # Failed imports list
│   ├── SyncHistory.tsx         # Historical sync logs
│   └── PresetManager.tsx       # Save/load import presets
```

---

## 🚀 Implementation Phases

### Phase 1: Critical Fixes (Priority: HIGHEST)

1. **Content Count Fix**
   - Audit existing content table for orphan/malformed records
   - Verify TMDB ID integrity
   - Run gap detection on current data

2. **UI Alignment**
   - Restyle Data Sync page with dark theme
   - Match card/section styling from Content Manager
   - Fix analytics display

3. **Basic Cron Controller**
   - Add `sync_settings` table
   - Implement pause/resume API
   - Add dashboard toggle

**Estimated Effort:** 4-6 hours

---

### Phase 2: Core Enhancements (Priority: HIGH)

1. **Gap Detection System**
   - Create `gap_registry` table
   - Implement gap detection algorithms
   - Add gap dashboard section

2. **Enhanced Bulk Import**
   - Rich filter interface
   - Preview functionality
   - Duplicate detection

3. **Import Queue**
   - Background job processing
   - Progress tracking
   - Queue management UI

**Estimated Effort:** 8-12 hours

---

### Phase 3: Advanced Features (Priority: MEDIUM)

1. **Gap Auto-Fill Scheduler**
   - Scheduled gap fill jobs
   - Priority-based filling
   - Rate limiting

2. **Import Presets**
   - Save/load configurations
   - Preset management UI

3. **Sync History & Logs**
   - Detailed logging
   - Historical view
   - Export functionality

**Estimated Effort:** 6-8 hours

---

### Phase 4: Polish (Priority: LOW)

1. **Notification System**
   - Discord/webhook alerts
   - Email notifications
   - In-app notifications

2. **Advanced Analytics**
   - Interactive charts
   - Trend analysis
   - Content growth metrics

3. **Export & Reporting**
   - PDF/CSV reports
   - Scheduled reports

**Estimated Effort:** 4-6 hours

---

## ✅ Acceptance Criteria

### Must Have (MVP)
- [ ] Content count matches expected (~2000+ items after gap fill)
- [ ] Data Sync UI matches app design language
- [ ] Cron can be paused/resumed from dashboard
- [ ] Bulk import supports content type, country, and date filters
- [ ] Popularity serves as sort priority, not exclusive filter
- [ ] Duplicate detection before import
- [ ] Gap detection identifies missing content

### Should Have
- [ ] Gap auto-fill functionality
- [ ] Import queue with progress tracking
- [ ] Import presets (save/load)
- [ ] Sync history logs

### Nice to Have
- [ ] Export capabilities
- [ ] Notification system
- [ ] Advanced analytics charts

---

## 🔧 Technical Notes for Implementation

### Rate Limiting

TMDB API has rate limits. Implement:
- Request queue with delays (250ms between requests)
- Backoff on 429 errors
- Batch requests where possible

### Background Processing

Use:
- Next.js API routes for quick operations
- Edge functions or cron for long-running jobs
- Consider Supabase Edge Functions for background work

### Error Handling

- Log all errors to `sync_logs` with full context
- Implement retry logic with exponential backoff
- Surface recoverable errors in dashboard

### Caching

- Cache TMDB genre/country lists
- Cache duplicate check results during import
- Invalidate caches on forced sync

---

## 📝 Implementation Checklist

```markdown
### Phase 1: Critical Fixes
- [ ] Create sync_settings table
- [ ] Create gap_registry table
- [ ] Audit content for data issues
- [ ] Restyle Data Sync UI (dark theme)
- [ ] Fix analytics displays
- [ ] Implement /api/sync/status endpoint
- [ ] Implement /api/sync/pause endpoint
- [ ] Implement /api/sync/resume endpoint
- [ ] Add Pause/Resume buttons to dashboard

### Phase 2: Core Enhancements
- [ ] Create import_jobs table
- [ ] Implement gap detection algorithms
- [ ] Build gap management UI section
- [ ] Create BulkImportCenter component
- [ ] Implement filter form (type, country, date, genre)
- [ ] Add popularity priority slider
- [ ] Implement import preview API
- [ ] Add duplicate detection logic
- [ ] Build import queue UI
- [ ] Implement queue management (pause/resume/cancel)

### Phase 3: Advanced Features
- [ ] Create import_presets table
- [ ] Build preset manager UI
- [ ] Implement gap auto-fill scheduler
- [ ] Create sync_logs table
- [ ] Build sync history view
- [ ] Add export functionality

### Phase 4: Polish
- [ ] Add notification webhooks
- [ ] Build advanced analytics charts
- [ ] Create report generation
```

---

## 🎨 Design Tokens Reference

```css
/* Colors */
--bg-primary: #0f172a;     /* slate-900 */
--bg-secondary: #1e293b;   /* slate-800 */
--bg-tertiary: #334155;    /* slate-700 */
--text-primary: #f8fafc;   /* slate-50 */
--text-secondary: #94a3b8; /* slate-400 */
--accent-blue: #3b82f6;    /* blue-500 */
--accent-green: #22c55e;   /* green-500 */
--accent-amber: #f59e0b;   /* amber-500 */
--accent-red: #ef4444;     /* red-500 */
--accent-purple: #a855f7;  /* purple-500 */

/* Spacing */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;

/* Border Radius */
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;

/* Shadows */
--shadow-card: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
--shadow-hover: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
```

---

> **Note to Future Agents:** This document is comprehensive but not exhaustive. Use your judgment to fill in implementation details. When in doubt, ask the user for clarification. Always prioritize the user's explicit requirements over enhancements.

---

*Document Version: 1.0*  
*Created: 2026-01-27*  
*For: GDVG Admin Console*
