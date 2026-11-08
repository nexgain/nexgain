-- =====================================================================
-- NexGain: connect Square (the first real business-app connection).
--   - connected_accounts can now hold Square as well as Gmail and Outlook.
--     Same lock-down as before: login tokens are encrypted by the Edge
--     Functions and the app can never read this table, only the safe
--     my_connected_accounts view (which app, who, when).
--   - external_id: the provider's own id for the connected account (Square's
--     merchant id), used to cancel NexGain's access when disconnecting.
--   - account_email holds the business name for apps (an email address for
--     Gmail and Outlook).
--
-- Run after the earlier files:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again. Doesn't change or remove any existing connection.
-- =====================================================================

alter table public.connected_accounts add column if not exists external_id text;

alter table public.connected_accounts drop constraint if exists connected_accounts_provider_check;
alter table public.connected_accounts add constraint connected_accounts_provider_check
  check (provider in ('google', 'microsoft', 'square'));

-- Tell the Supabase API about the new column straight away.
notify pgrst, 'reload schema';
