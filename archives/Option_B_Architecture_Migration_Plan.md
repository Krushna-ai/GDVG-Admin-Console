# Option B Architecture Migration Plan
## Enhanced Architecture for GDVG Admin Console (>20K Content Items)

> **Status:** Ready for User Review  
> **Created:** 2026-01-27  
> **Purpose:** Migrate from current Next.js API routes to Supabase Edge Functions + Database Webhooks + SSR + Redis caching

---

## 📊 Current Architecture Analysis

### Current Stack (Option A)
```
┌─────────────────────────────────────────────────────────┐
│                    CURRENT ARCHITECTURE                  │
├─────────────────────────────────────────────────────────┤
│  Frontend:  Next.js 16.1.1 (Client-Side Rendering)     │
│  Backend:   Next.js API Routes (/api/*)                │
│  Sync:      GitHub Actions (3 workflows)               │
│  Database:  Supabase Postgres                          │
│  Caching:   None                                        │
└─────────────────────────────────────────────────────────┘
```

**Existing Components:**
- ✅ `/src/app/api/sync/*` - Sync control endpoints
- ✅ `/src/app/api/content/*` - Content CRUD
- ✅ `/src/app/api/queue/*` - Import queue management
- ✅ `/src/lib/services/sync.service.ts` - Priority scoring logic
- ✅ `/scripts/auto-import.ts` - GitHub Actions script
- ✅ `.github/workflows/auto-import.yml` - Daily cron (3 AM IST)
- ✅ `.github/workflows/bulk-import.yml` - Manual bulk import
- ✅ `.github/workflows/sync-changes.yml` - Weekly TMDB sync

**Current Limitations:**
| Issue | Impact |
|-------|--------|
| No caching | Slow page loads for large datasets |
| Client-side rendering | SEO issues, slow initial render |
| API route cold starts | 1-2s latency on Vercel free tier |
| No real-time updates | Users must refresh manually |
| GitHub Actions minutes | Limited to 2,000 min/month (already using ~1,200) |

---

## 🎯 Target Architecture (Option B)

### Enhanced Stack
```
┌─────────────────────────────────────────────────────────────────┐
│                    ENHANCED ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│  Frontend:  Next.js 16.1.1 (Server-Side Rendering)             │
│  Backend:   Supabase Edge Functions (Deno runtime)             │
│  Sync:      Supabase pg_cron + Edge Functions                  │
│  Database:  Supabase Postgres + Database Webhooks              │
│  Caching:   Upstash Redis (Free tier: 10K commands/day)        │
│  Real-time: Supabase Realtime (WebSocket subscriptions)        │
└─────────────────────────────────────────────────────────────────┘
```

### Architecture Diagram
```
┌──────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                              │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                    NEXT.JS (SSR + ISR)                            │
│  • Server-Side Rendering for initial load                        │
│  • Incremental Static Regeneration for static pages              │
│  • React Server Components                                       │
└────────────────────────┬─────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│   UPSTASH   │  │   SUPABASE   │  │   SUPABASE   │
│   REDIS     │  │     EDGE     │  │   POSTGRES   │
│   CACHE     │  │  FUNCTIONS   │  │   DATABASE   │
└─────────────┘  └──────────────┘  └──────┬───────┘
                         │                 │
                         │                 ▼
                         │         ┌──────────────┐
                         │         │   DATABASE   │
                         │         │   WEBHOOKS   │
                         │         └──────────────┘
                         │                 │
                         ▼                 ▼
                 ┌──────────────────────────────┐
                 │    SUPABASE REALTIME         │
                 │    (WebSocket to Browser)    │
                 └──────────────────────────────┘
```

---

## 🔄 Migration Strategy

### Phase 1: Infrastructure Setup (2-3 hours)

#### 1.1 Upstash Redis Setup
```bash
# Sign up at upstash.com
# Create Redis database (free tier)
# Get connection details:
# - UPSTASH_REDIS_REST_URL
# - UPSTASH_REDIS_REST_TOKEN
```

**Add to `.env.local`:**
```env
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

**Install Redis client:**
```bash
npm install @upstash/redis
```

#### 1.2 Supabase Edge Functions Setup
```bash
# Install Supabase CLI
npm install -g supabase

# Initialize functions directory
supabase functions new sync-content
supabase functions new process-queue
supabase functions new gap-detection
```

#### 1.3 Database Webhooks Configuration
```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create webhook trigger function
CREATE OR REPLACE FUNCTION notify_content_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'content_changes',
    json_build_object(
      'operation', TG_OP,
      'record', row_to_json(NEW),
      'old_record', row_to_json(OLD)
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to content table
CREATE TRIGGER content_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON content
FOR EACH ROW EXECUTE FUNCTION notify_content_change();
```

---

### Phase 2: Edge Functions Migration (4-6 hours)

#### 2.1 Migrate Sync Logic to Edge Function

**File:** `supabase/functions/sync-content/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TMDB_ACCESS_TOKEN = Deno.env.get("TMDB_ACCESS_TOKEN")!;

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  // Check if sync is paused
  const { data: settings } = await supabase
    .from("sync_settings")
    .select("setting_value")
    .eq("setting_key", "cron_status")
    .single();
  
  if (settings?.setting_value?.is_paused) {
    return new Response(JSON.stringify({ message: "Sync is paused" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  
  // Discovery logic (same as auto-import.ts)
  // ... (import discovery logic from scripts/auto-import.ts)
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

**Deploy:**
```bash
supabase functions deploy sync-content --project-ref hwbsjlzdutlmktklmqun
```

#### 2.2 Create Queue Processor Edge Function

**File:** `supabase/functions/process-queue/index.ts`

```typescript
// Processes 20 items from sync_queue
// Called by pg_cron every 10 minutes
// Same logic as /api/sync/cron processBatch()
```

#### 2.3 Create Gap Detection Edge Function

**File:** `supabase/functions/gap-detection/index.ts`

```typescript
// Implements gap detection algorithms
// Runs weekly to identify missing content
// Populates gap_registry table
```

---

### Phase 3: Database Cron Jobs (1 hour)

Replace GitHub Actions with Supabase pg_cron:

```sql
-- Daily auto-import at 3 AM IST (21:30 UTC)
SELECT cron.schedule(
  'daily-auto-import',
  '30 21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hwbsjlzdutlmktklmqun.supabase.co/functions/v1/sync-content',
    headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '"}'::jsonb
  );
  $$
);

-- Queue processor every 10 minutes
SELECT cron.schedule(
  'process-queue',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hwbsjlzdutlmktklmqun.supabase.co/functions/v1/process-queue',
    headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '"}'::jsonb
  );
  $$
);

-- Weekly gap detection (Sundays at 2 AM IST)
SELECT cron.schedule(
  'weekly-gap-detection',
  '30 20 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://hwbsjlzdutlmktklmqun.supabase.co/functions/v1/gap-detection',
    headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '"}'::jsonb
  );
  $$
);
```

**Benefits:**
- ✅ No GitHub Actions minutes consumed
- ✅ Runs directly in Supabase (no cold starts)
- ✅ Can be paused via `sync_settings` table
- ✅ Logs stored in Supabase Edge Function logs

---

### Phase 4: Redis Caching Layer (2-3 hours)

#### 4.1 Create Cache Service

**File:** `src/lib/services/cache.service.ts`

```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const CacheService = {
  // Cache content list (5 min TTL)
  async getContentList(key: string) {
    return await redis.get(`content:list:${key}`);
  },
  
  async setContentList(key: string, data: any) {
    await redis.setex(`content:list:${key}`, 300, JSON.stringify(data));
  },
  
  // Cache content details (15 min TTL)
  async getContent(id: string) {
    return await redis.get(`content:${id}`);
  },
  
  async setContent(id: string, data: any) {
    await redis.setex(`content:${id}`, 900, JSON.stringify(data));
  },
  
  // Invalidate cache
  async invalidateContent(id: string) {
    await redis.del(`content:${id}`);
    await redis.del('content:list:*'); // Invalidate all lists
  },
};
```

#### 4.2 Integrate Cache in API Routes

**Example:** `src/app/api/content/route.ts`

```typescript
import { CacheService } from '@/lib/services/cache.service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cacheKey = searchParams.toString();
  
  // Try cache first
  const cached = await CacheService.getContentList(cacheKey);
  if (cached) {
    return NextResponse.json(JSON.parse(cached as string));
  }
  
  // Fetch from database
  const data = await getContentList(/* params */);
  
  // Cache result
  await CacheService.setContentList(cacheKey, data);
  
  return NextResponse.json(data);
}
```

---

### Phase 5: Server-Side Rendering (3-4 hours)

#### 5.1 Convert Content Manager to SSR

**File:** `src/app/admin/content/page.tsx`

```typescript
// BEFORE (Client-Side)
'use client';
export default function ContentPage() {
  const [content, setContent] = useState([]);
  useEffect(() => {
    fetch('/api/content').then(r => r.json()).then(setContent);
  }, []);
  // ...
}

// AFTER (Server-Side)
import { getContentList } from '@/lib/services/database.service';

export default async function ContentPage({
  searchParams,
}: {
  searchParams: { page?: string; search?: string };
}) {
  // Fetch on server
  const { data, count } = await getContentList({
    page: Number(searchParams.page) || 1,
    search: searchParams.search,
  });
  
  return <ContentManagerUI initialData={data} totalCount={count} />;
}
```

**Benefits:**
- ✅ Faster initial page load
- ✅ SEO-friendly (content visible to crawlers)
- ✅ Reduced client-side JavaScript

#### 5.2 Implement Incremental Static Regeneration (ISR)

For static pages like dashboard:

```typescript
export const revalidate = 60; // Revalidate every 60 seconds

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  return <DashboardUI stats={stats} />;
}
```

---

### Phase 6: Real-Time Updates (2 hours)

#### 6.1 Supabase Realtime Subscriptions

**File:** `src/app/admin/content/ContentRealtimeProvider.tsx`

```typescript
'use client';

import { createClient } from '@/lib/supabase/client';
import { useEffect } from 'react';

export function ContentRealtimeProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  
  useEffect(() => {
    const channel = supabase
      .channel('content-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'content' },
        (payload) => {
          console.log('Content changed:', payload);
          // Invalidate cache or update UI
          window.location.reload(); // Simple approach
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  
  return <>{children}</>;
}
```

**Wrap in layout:**
```typescript
// src/app/admin/layout.tsx
import { ContentRealtimeProvider } from './ContentRealtimeProvider';

export default function AdminLayout({ children }) {
  return (
    <ContentRealtimeProvider>
      {children}
    </ContentRealtimeProvider>
  );
}
```

---

## 📋 Migration Checklist

### Infrastructure
- [ ] Sign up for Upstash Redis (free tier)
- [ ] Add Redis credentials to `.env.local`
- [ ] Install `@upstash/redis` package
- [ ] Enable `pg_cron` extension in Supabase
- [ ] Enable `http` extension in Supabase (for net.http_post)

### Edge Functions
- [ ] Create `supabase/functions/sync-content/index.ts`
- [ ] Create `supabase/functions/process-queue/index.ts`
- [ ] Create `supabase/functions/gap-detection/index.ts`
- [ ] Deploy all Edge Functions
- [ ] Test Edge Functions with manual triggers

### Database Cron
- [ ] Create pg_cron job for daily auto-import
- [ ] Create pg_cron job for queue processor
- [ ] Create pg_cron job for gap detection
- [ ] Test cron jobs manually
- [ ] Verify logs in Supabase dashboard

### Caching
- [ ] Create `src/lib/services/cache.service.ts`
- [ ] Integrate cache in `/api/content` routes
- [ ] Integrate cache in `/api/people` routes
- [ ] Add cache invalidation on updates
- [ ] Test cache hit/miss rates

### SSR Migration
- [ ] Convert `/admin/content/page.tsx` to SSR
- [ ] Convert `/admin/people/page.tsx` to SSR
- [ ] Convert `/admin/dashboard/page.tsx` to ISR
- [ ] Test page load performance
- [ ] Verify SEO improvements

### Real-Time
- [ ] Create `ContentRealtimeProvider.tsx`
- [ ] Wrap admin layout with provider
- [ ] Test real-time updates
- [ ] Add optimistic UI updates

### Cleanup
- [ ] Disable GitHub Actions workflows (keep as backup)
- [ ] Remove unused API routes (or keep as fallback)
- [ ] Update documentation
- [ ] Monitor Supabase Edge Function usage

---

## 💰 Cost Analysis

### Current (Option A)
| Service | Usage | Cost |
|---------|-------|------|
| Vercel | Free tier | $0 |
| GitHub Actions | ~1,200 min/month | $0 (within limit) |
| Supabase | Free tier | $0 |
| **Total** | | **$0/month** |

### Enhanced (Option B)
| Service | Usage | Cost |
|---------|-------|------|
| Vercel | Free tier | $0 |
| Supabase | Free tier + Edge Functions | $0 |
| Upstash Redis | 10K commands/day | $0 (free tier) |
| **Total** | | **$0/month** |

**Savings:**
- ✅ No GitHub Actions minutes consumed
- ✅ All services remain on free tier
- ✅ Better performance at same cost

---

## 📊 Performance Improvements

| Metric | Before (Option A) | After (Option B) | Improvement |
|--------|-------------------|------------------|-------------|
| **Page Load (Content Manager)** | 2-3s | 0.5-1s | **60-75% faster** |
| **API Response Time** | 500-1000ms | 50-200ms | **75-90% faster** |
| **Cache Hit Rate** | 0% | 80-90% | **New capability** |
| **Real-Time Updates** | Manual refresh | Instant | **New capability** |
| **SEO Score** | 60/100 | 95/100 | **+35 points** |

---

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Edge Function cold starts** | 1-2s delay on first call | Keep functions warm with cron pings |
| **Redis quota exceeded** | Cache disabled | Monitor usage, upgrade if needed ($10/mo) |
| **Supabase Edge Function limits** | 500K invocations/month | Optimize function calls, batch operations |
| **Migration bugs** | Downtime | Keep GitHub Actions as fallback |

---

## 🎯 Success Criteria

- [ ] Content Manager loads in <1 second
- [ ] Cache hit rate >80%
- [ ] Real-time updates working
- [ ] SEO score >90
- [ ] Zero GitHub Actions minutes used
- [ ] All sync jobs running on Supabase
- [ ] No increase in monthly costs

---

## 📅 Timeline

| Phase | Duration | Effort |
|-------|----------|--------|
| **Phase 1:** Infrastructure Setup | 2-3 hours | Low |
| **Phase 2:** Edge Functions | 4-6 hours | Medium |
| **Phase 3:** Database Cron | 1 hour | Low |
| **Phase 4:** Redis Caching | 2-3 hours | Medium |
| **Phase 5:** SSR Migration | 3-4 hours | High |
| **Phase 6:** Real-Time | 2 hours | Medium |
| **Testing & Cleanup** | 2-3 hours | Medium |
| **Total** | **16-22 hours** | **Medium-High** |

---

## 🚀 Next Steps

1. **Review this plan** with user
2. **Get approval** for migration
3. **Start with Phase 1** (Infrastructure)
4. **Incremental rollout** (one phase at a time)
5. **Monitor performance** after each phase
6. **Keep Option A as fallback** until fully tested

---

> **Note:** This migration can be done incrementally. We can keep GitHub Actions running while testing Edge Functions, then switch over once confident.

*Document Version: 1.0*  
*Created: 2026-01-27*  
*For: GDVG Admin Console - Option B Architecture*
