// Supabase Edge Function: the daily business health check. Runs the shared
// insights engine (_shared/ai/insights.ts) and saves what it finds into the
// ai_insights table, which the Dashboard, Analytics page and AI Assistant read.
// Urgent findings are also sent to the owner's Notifications, once each.
//
// Called by:
//   1. The timer (pg_cron, once a day) with header x-cron-secret: checks every business.
//   2. The app ("Refresh" on the AI Assistant), with the owner's login: checks their business only.
//
// POST {} -> 200 { businesses, insights }
//
// Setup: deploy as "ai-insights" with "Verify JWT" OFF (the timer has no login;
// the password or the owner's login is checked below). Secret: AI_INSIGHTS_CRON_SECRET.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { adminDb, CORS, env, ownerBusinessId, reply } from '../_shared/connections.ts';
import { runHealthCheck } from '../_shared/ai/insights.ts';
import { loadSnapshot } from '../_shared/ai/snapshot.ts';
import type { Insight, InsightArea } from '../_shared/ai/types.ts';

/** Which notification type (and so which Notifications filter) an urgent insight goes under. */
const NOTIFICATION_TYPE: Record<InsightArea, string> = {
  finance: 'ai_alert_finance',
  spending: 'ai_alert_finance',
  jobs: 'ai_alert_jobs',
  team: 'ai_alert_team',
};

type ExistingRow = { id: string; key: string; status: string; notified_at: string | null };

/** Checks one business and brings its ai_insights rows up to date. Returns how many it found. */
async function checkBusiness(db: SupabaseClient, businessId: string, ownerId: string | null) {
  const snapshot = await loadSnapshot(db, businessId);
  if (!snapshot) return 0;
  const found = runHealthCheck(snapshot);
  const nowIso = new Date().toISOString();

  const { data: existingData, error: readError } = await db
    .from('ai_insights')
    .select('id, key, status, notified_at')
    .eq('business_id', businessId)
    .in('status', ['active', 'dismissed']);
  if (readError) throw new Error(readError.message);
  const existing = new Map((existingData as ExistingRow[]).map((r) => [r.key, r]));

  // Save what was found (a dismissed insight stays dismissed while the problem lasts).
  const rows = found.map((i: Insight) => ({
    business_id: businessId,
    key: i.key,
    check_name: i.check,
    area: i.area,
    severity: i.severity,
    placements: i.placements,
    title: i.title,
    summary: i.summary,
    suggestion: i.suggestion,
    estimated_saving: i.estimatedSaving,
    related: i.related,
    metrics: i.metrics,
    status: existing.get(i.key)?.status === 'dismissed' ? 'dismissed' : 'active',
    last_seen_at: nowIso,
    resolved_at: null,
  }));
  if (rows.length > 0) {
    const { error } = await db.from('ai_insights').upsert(rows, { onConflict: 'business_id,key' });
    if (error) throw new Error(error.message);
  }

  // Problems that have gone away are marked resolved (kept for history).
  const foundKeys = new Set(found.map((i) => i.key));
  const gone = [...existing.values()].filter((r) => !foundKeys.has(r.key)).map((r) => r.id);
  if (gone.length > 0) {
    const { error } = await db.from('ai_insights').update({ status: 'resolved', resolved_at: nowIso }).in('id', gone);
    if (error) throw new Error(error.message);
  }

  // Urgent, new and not dismissed: tell the owner once.
  const toNotify = found.filter(
    (i) => i.placements.includes('notification') && !existing.get(i.key)?.notified_at && existing.get(i.key)?.status !== 'dismissed',
  );
  if (ownerId && toNotify.length > 0) {
    const { error } = await db.from('notifications').insert(
      toNotify.map((i) => ({
        business_id: businessId,
        recipient_id: ownerId,
        audience: 'owner',
        type: NOTIFICATION_TYPE[i.area],
        title: i.title,
        summary: i.summary,
        body: `${i.summary}\n\nSuggested fix: ${i.suggestion}`,
        details: [
          { label: 'Found by', value: 'NexGain AI health check' },
          ...(i.estimatedSaving ? [{ label: 'Estimated saving', value: `$${i.estimatedSaving.toFixed(2)}` }] : []),
        ],
      })),
    );
    if (error) console.warn('Could not send AI alerts:', error.message);
    else {
      await db
        .from('ai_insights')
        .update({ notified_at: nowIso })
        .eq('business_id', businessId)
        .in('key', toNotify.map((i) => i.key));
    }
  }
  return found.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });
  const db = adminDb();

  try {
    const cronSecret = req.headers.get('x-cron-secret');
    if (cronSecret) {
      // The daily timer: every business, one at a time (one failing doesn't stop the rest).
      if (cronSecret !== env('AI_INSIGHTS_CRON_SECRET')) return reply(401, { error: 'Wrong password.' });
      const { data: businesses, error } = await db.from('businesses').select('id, owner_id');
      if (error) throw new Error(error.message);
      let insights = 0;
      for (const b of businesses ?? []) {
        try {
          insights += await checkBusiness(db, b.id as string, (b.owner_id as string | null) ?? null);
        } catch (e) {
          console.warn(`Health check failed for a business:`, e instanceof Error ? e.message : e);
        }
      }
      return reply(200, { businesses: businesses?.length ?? 0, insights });
    }

    // The owner pressing Refresh: their own business only.
    const businessId = await ownerBusinessId(req, db);
    if (!businessId) return reply(401, { error: 'not_owner', message: 'Only business owners can run the health check.' });
    const { data: owner } = await db.from('businesses').select('owner_id').eq('id', businessId).maybeSingle();
    const insights = await checkBusiness(db, businessId, (owner?.owner_id as string | null) ?? null);
    return reply(200, { businesses: 1, insights });
  } catch (e) {
    console.warn('Health check failed:', e instanceof Error ? e.message : e);
    return reply(500, { error: 'failed', message: "The health check couldn't run. Please try again." });
  }
});
