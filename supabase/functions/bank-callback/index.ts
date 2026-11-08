// Supabase Edge Function: where Basiq sends the owner after they've logged in
// to their bank and allowed NexGain to see it.
//
// GET ?state=...&jobIds=a,b,c
//
// Checks the one-time state code, notes the jobs Basiq is running to fetch the
// bank's data (bank-sync waits for them), and sends the owner back into the app:
//   ?status=connected   or   ?status=cancelled
//
// Setup: deploy as "bank-callback" and turn OFF "Verify JWT" (Basiq sends the
// browser here without a NexGain login; the state code is checked instead).
// Paste its address into the Basiq dashboard
// (Customise UI > Flow > External URLs > Redirect URL):
//   https://<project-ref>.supabase.co/functions/v1/bank-callback
import { adminDb } from '../_shared/connections.ts';

function backToApp(appRedirect: string, params: Record<string, string>) {
  const url = new URL(appRedirect);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store' } });
}

function plainPage(text: string) {
  return new Response(text, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return plainPage('Method not allowed.');
  const params = new URL(req.url).searchParams;
  const state = params.get('state') ?? '';
  if (!state) return plainPage('This link is not valid. Go back to the NexGain app and try connecting your bank again.');

  const db = adminDb();
  // One-time: removed as it's read.
  const { data: saved } = await db.from('oauth_states').delete().eq('state', state).select().maybeSingle();
  if (!saved || new Date(saved.expires_at) < new Date()) {
    return plainPage('This bank login has expired. Go back to the NexGain app and tap Connect again.');
  }

  const jobIds = (params.get('jobIds') ?? params.get('jobId') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  // No jobs: the owner closed Basiq's page before connecting a bank.
  if (jobIds.length === 0) return backToApp(saved.app_redirect, { status: 'cancelled', kind: 'bank' });

  const { error } = await db
    .from('bank_connections')
    .update({ status: 'active', pending_job_ids: jobIds })
    .eq('business_id', saved.business_id);
  if (error) {
    console.error('bank-callback:', error.message);
    return backToApp(saved.app_redirect, { status: 'error', kind: 'bank', message: 'Something went wrong connecting your bank. Please try again.' });
  }
  return backToApp(saved.app_redirect, { status: 'connected', kind: 'bank' });
});
