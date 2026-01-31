# Testing Phase 9: Queue-Based Enrichment

## Testing via GitHub Actions

### 1. Test Data Quality → Queue Population

**Workflow:** `validate-content.yml` or manual trigger

1. Go to **Actions** → **Data Quality** workflow
2. Click **Run workflow**
3. Check the logs to see items added to `enrichment_queue`

**Expected Result:**
- Items with missing data are queued
- Priority based on issue count (more issues = higher priority)

---

### 2. Test Queue-Based Enrichment

**Workflow:** `enrich-content.yml`

1. Go to **Actions** → **Enrich Content Data**
2. Click **Run workflow**
3. Set parameters:
   - Batch Size: `10` (for testing)
   - Dry Run: `false`
4. Monitor the workflow execution (max 5 hours)

**Expected Result:**
- ✅ Pause check passes
- ✅ Processes items from queue in priority order
- ✅ Updates status: pending → processing → completed
- ✅ Failed items marked for retry
- ✅ Graceful shutdown before 5-hour timeout

---

### 3. Test Pause/Resume

**Test Pause:**
1. Go to **Gap & Enrichment** page in admin
2. Click **Pause** button
3. Trigger `enrich-content.yml` workflow
4. **Expected:** Workflow exits gracefully with "⏸️ Enrichment is paused"

**Test Resume:**
1. Click **Resume** button
2. Trigger workflow again
3. **Expected:** Workflow processes queue items

---

### 4. Test Timeout Handling

**Option A: Wait for timeout (5 hours)**
- Trigger workflow with large queue
- Wait 5 hours
- **Expected:** Graceful shutdown with "⏰ Approaching timeout threshold"

**Option B: Simulate (modify workflow temporarily)**
- Change `timeout-minutes: 300` → `timeout-minutes: 5`
- **Expected:** Shutdown before GitHub kills the job

---

### 5. Verify Queue State

**Check Supabase:**
1. Go to Supabase → Table Editor → `enrichment_queue`
2. Verify:
   - Items marked `processing` during workflow
   - Items marked `completed` after success
   - Items marked `failed` with error messages
   - `retry_count` increments for failures

---

## Quick Test Checklist

- [ ] Queue populates from data-quality validation
- [ ] Enrichment workflow processes queue items
- [ ] Pause stops workflow gracefully
- [ ] Resume allows workflow to continue
- [ ] Timeout handling works (5-hour limit)
- [ ] Failed items retry up to 3 times
- [ ] Queue status updates correctly in Supabase

---

## Notes

- All testing happens via GitHub Actions workflows
- No local testing required
- Check **Actions** tab for workflow runs
- Check **Supabase** for queue state
- Check **Gap & Enrichment** page for status
