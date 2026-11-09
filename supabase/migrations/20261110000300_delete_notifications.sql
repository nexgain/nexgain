-- =====================================================================
-- NexGain: the bin on each notification.
-- Owners and employees can delete their own notifications (only their own).
-- AI alerts aren't sent again after being deleted: ai_insights remembers
-- which ones were sent.
-- Run once: Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again.
-- =====================================================================

grant delete on public.notifications to authenticated;

drop policy if exists "delete own notifications" on public.notifications;
create policy "delete own notifications" on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());
