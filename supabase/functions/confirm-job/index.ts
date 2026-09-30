// Supabase Edge Function: confirm a job from an accepted quote and email the client.
//
// POST { mode: "confirm", quoteId, job: { title, description, address, start, end, notes,
//        clientName, clientEmail, clientPhone } }
//   1. books the job in the database (job + calendar event + client, quote -> Booked)
//   2. emails the client a confirmation (Resend)
//   3. if the email fails, undoes step 1 so nothing is left half-done
// POST { mode: "update", jobId }  -> emails the client the job's current date and time.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   RESEND_API_KEY  - required
//   EMAIL_FROM      - optional, e.g. "Smith Cleaning <bookings@smithcleaning.com.au>"
//                     (must be on a domain verified in Resend; defaults to Resend's test sender)
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type JobRow = {
  id: string;
  business_id: string;
  quote_id: string | null;
  client_id: string | null;
  title: string;
  description: string;
  address: string;
  scheduled_start: string;
  scheduled_end: string;
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function when(job: JobRow, timeZone: string) {
  const start = new Date(job.scheduled_start);
  const end = new Date(job.scheduled_end);
  const date = start.toLocaleDateString('en-AU', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = (d: Date) => d.toLocaleTimeString('en-AU', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true });
  return { date, time: `${time(start)} – ${time(end)}` };
}

function emailHtml(opts: {
  businessName: string;
  heading: string;
  intro: string;
  clientName: string;
  date: string;
  time: string;
  address: string;
  title: string;
  description: string;
  contactEmail: string;
}) {
  const rows = [
    ['Date', opts.date],
    ['Time', opts.time],
    ['Address', opts.address || '—'],
    ['Job', opts.title],
  ]
    .map(
      ([label, value]) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;color:#6B7280;font-size:14px;width:90px;vertical-align:top">${label}</td>
        <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;color:#111827;font-size:15px;font-weight:600">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join('');
  const work = escapeHtml(opts.description || '').replace(/\n/g, '<br>');
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">
        <tr><td style="background:#111827;padding:22px 24px;color:#FFFFFF;font-size:20px;font-weight:700">${escapeHtml(opts.businessName)}</td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 8px;font-size:22px;color:#111827">${escapeHtml(opts.heading)}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:22px;color:#374151">Hi ${escapeHtml(opts.clientName || 'there')},<br>${escapeHtml(opts.intro)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          ${work ? `<h2 style="margin:24px 0 8px;font-size:16px;color:#111827">Work to be done</h2>
          <p style="margin:0;font-size:15px;line-height:22px;color:#374151">${work}</p>` : ''}
          <p style="margin:24px 0 0;font-size:14px;line-height:21px;color:#6B7280">If you need to change anything, just reply to this email${
            opts.contactEmail ? ` or contact us at ${escapeHtml(opts.contactEmail)}` : ''
          }.</p>
          <p style="margin:16px 0 0;font-size:15px;color:#111827">Thanks,<br><strong>${escapeHtml(opts.businessName)}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendEmail(to: string, subject: string, html: string, text: string, fromName: string, replyTo: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error("Email isn't set up yet (RESEND_API_KEY is missing in Supabase).");
  const from = Deno.env.get('EMAIL_FROM') || `${fromName.replace(/[<>"]/g, '')} <onboarding@resend.dev>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`The email couldn't be sent: ${detail.message ?? res.statusText}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  // Acts as the signed-in owner, so the database's security rules still apply.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  let body: { mode?: string; quoteId?: string; jobId?: string; job?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid request.' });
  }

  let job: JobRow;
  let bookedNow = false;
  let clientName = '';
  let clientEmail = '';

  if (body.mode === 'confirm') {
    const j = body.job ?? {};
    clientName = (j.clientName ?? '').trim();
    clientEmail = (j.clientEmail ?? '').trim();
    if (!body.quoteId) return reply(400, { error: 'Missing quote.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) return reply(400, { error: "Enter the client's email address." });
    const { data, error } = await supabase.rpc('book_job', {
      p_quote_id: body.quoteId,
      p: {
        title: j.title,
        description: j.description,
        address: j.address,
        start: j.start,
        end: j.end,
        notes: j.notes ?? '',
        client_name: clientName,
        client_email: clientEmail,
        client_phone: j.clientPhone ?? '',
      },
    });
    if (error) return reply(400, { error: error.message });
    job = data as JobRow;
    bookedNow = true;
  } else if (body.mode === 'update') {
    const { data, error } = await supabase.from('jobs').select('*').eq('id', body.jobId ?? '').maybeSingle();
    if (error || !data) return reply(404, { error: 'Job not found.' });
    job = data as JobRow;
    if (job.client_id) {
      const { data: client } = await supabase.from('clients').select('name, email').eq('id', job.client_id).maybeSingle();
      clientName = client?.name ?? '';
      clientEmail = client?.email ?? '';
    }
    if (!clientEmail) return reply(400, { error: "This job's client has no email address." });
  } else {
    return reply(400, { error: 'Unknown request.' });
  }

  try {
    const { data: biz } = await supabase
      .from('businesses')
      .select('name, owner_email, timezone')
      .eq('id', job.business_id)
      .maybeSingle();
    const businessName = biz?.name || 'NexGain';
    const { date, time } = when(job, biz?.timezone || 'Australia/Brisbane');
    const updated = body.mode === 'update';
    const heading = updated ? 'Your booking has been updated' : 'Your job is confirmed';
    const intro = updated
      ? `The date or time of your booking with ${businessName} has changed. Here are the new details.`
      : `Thanks for choosing ${businessName}. Your job is booked in. Here are the details.`;
    const html = emailHtml({
      businessName,
      heading,
      intro,
      clientName,
      date,
      time,
      address: job.address,
      title: job.title,
      description: job.description,
      contactEmail: biz?.owner_email ?? '',
    });
    const text = `${businessName}\n\n${heading}\n\nHi ${clientName || 'there'},\n${intro}\n\nDate: ${date}\nTime: ${time}\nAddress: ${job.address || '—'}\nJob: ${job.title}\n\nWork to be done:\n${job.description}\n\nThanks,\n${businessName}`;
    await sendEmail(clientEmail, `${heading} – ${businessName}`, html, text, businessName, biz?.owner_email ?? '');
    return reply(200, { jobId: job.id });
  } catch (e) {
    // Keep the quote, job and calendar in step: nothing is booked unless the email went.
    if (bookedNow) await supabase.rpc('unbook_job', { p_job_id: job.id });
    return reply(502, { error: e instanceof Error ? e.message : 'The email could not be sent.' });
  }
});
