# GDVG Admin Console - Railway Deployment Guide

## Quick Deploy Steps

### 1. Push to GitHub
```bash
cd "d:\GDVG Projects\GDVG-Admin-Console"
git add .
git commit -m "Add Railway deployment config and TMDB sync cron"
git push origin main
```

### 2. Deploy on Railway
1. Go to [railway.app](https://railway.app)
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `GDVG-Admin-Console` repository
4. Railway will auto-detect Next.js and start building

### 3. Set Environment Variables
In Railway project settings → **Variables**, add:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hwbsjlzdutlmktklmqun.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<your-anon-key>` |
| `NEXT_SUPABASE_SERVICE_ROLE_KEY` | `<your-service-role-key>` |
| `TMDB_API_KEY` | `<your-tmdb-api-key>` |
| `CRON_SECRET` | `<generate-random-string>` |

### 4. Set Up Daily TMDB Sync (Cron)

**Option A: Railway Cron (if available on your plan)**
- Add a cron service in Railway
- Set schedule: `0 6 * * *` (6 AM UTC daily)
- Command: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.railway.app/api/cron/sync-tmdb`

**Option B: External Cron (Free)**
Use [cron-job.org](https://cron-job.org) or [EasyCron](https://www.easycron.com/):
- URL: `https://your-app.railway.app/api/cron/sync-tmdb`
- Method: GET
- Headers: `Authorization: Bearer <your-CRON_SECRET>`
- Schedule: Daily at 6:00 AM

---

## Files Created

| File | Purpose |
|------|---------|
| `railway.json` | Railway build/deploy config |
| `src/app/api/health/route.ts` | Health check endpoint |
| `src/app/api/cron/sync-tmdb/route.ts` | TMDB auto-sync cron job |

---

## Verification

After deployment, test these endpoints:
- Health check: `https://your-app.railway.app/api/health`
- Manual sync: `curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.railway.app/api/cron/sync-tmdb`

---

*Last updated: January 24, 2026*
