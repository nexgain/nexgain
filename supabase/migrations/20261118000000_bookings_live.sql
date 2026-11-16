-- NexGain Bookings: live updates. A booking made, moved or cancelled online
-- (or time off asked for) shows in the owner's and staff's app straight away.
-- Row level security still applies: staff only receive their own bookings.
-- Safe to run again.
do $$
declare
  t text;
begin
  foreach t in array array['bookings', 'booking_time_off'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end;
$$;
