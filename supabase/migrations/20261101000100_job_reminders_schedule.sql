-- =====================================================================
-- NexGain: the timer that sends job reminders every 15 minutes.
--   pg_cron (the timer) calls the "send-reminders" Edge Function using
--   pg_net (lets the database make web requests). The function's address and
--   its password are kept in Supabase Vault (encrypted), not in this file.
--
-- Before running: deploy the send-reminders function and set its
-- REMINDERS_CRON_SECRET secret (see the setup steps).
--
-- Run: Supabase > SQL Editor > New query > paste this whole file >
--   replace the TWO placeholders below > Run.
--   Don't save the filled-in version back into this file (it's in git).
-- Safe to run again (e.g. to change the password).
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  -- 1. Your project address: Supabase > Project Settings > Data API > Project URL.
  project_url text := 'https://YOUR-PROJECT-REF.supabase.co';
  -- 2. The same password you saved as the REMINDERS_CRON_SECRET Edge Function secret.
  cron_secret text := 'PASTE-THE-SAME-SECRET-HERE';
  existing uuid;
begin
  if project_url like '%YOUR-PROJECT-REF%' or cron_secret like 'PASTE-%' then
    raise exception 'Replace the two placeholders at the top of this file first.';
  end if;

  select id into existing from vault.secrets where name = 'project_url';
  if existing is null then perform vault.create_secret(project_url, 'project_url');
  else perform vault.update_secret(existing, project_url); end if;

  select id into existing from vault.secrets where name = 'reminders_cron_secret';
  if existing is null then perform vault.create_secret(cron_secret, 'reminders_cron_secret');
  else perform vault.update_secret(existing, cron_secret); end if;
end;
$$;

-- Every 15 minutes. Scheduling again with the same name replaces the old timer.
select cron.schedule(
  'send-job-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- To stop the timer:  select cron.unschedule('send-job-reminders');
-- To see recent runs: select * from cron.job_run_details order by start_time desc limit 20;
