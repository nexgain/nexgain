-- NexGain Bookings (System 2): which system each business uses.
--   'service'  = System 1 (trades and service businesses, the original app)
--   'bookings' = System 2, NexGain Bookings (barbers, salons... customers book appointments)
-- Every existing business stays on 'service'. Employees use their business's
-- system (they can already read their own business). Safe to run again.
alter table public.businesses add column if not exists system_type text not null default 'service';

alter table public.businesses drop constraint if exists businesses_system_type_check;
alter table public.businesses add constraint businesses_system_type_check
  check (system_type in ('service', 'bookings'));
