-- =====================================================================
-- NexGain Stage 4 update (run once, after schema.sql)
-- Paste into Supabase > SQL Editor > New query > Run. Safe to run again.
-- (schema.sql already includes these for brand-new setups.)
-- =====================================================================

-- An employee can only be paid once per pay period (stops double payments).
create unique index if not exists payslips_one_per_period on public.payslips (employee_id, period_start);

-- Is the signed-in person the owner of the business with this id (given as text,
-- e.g. the first folder of a file path)?
create or replace function public.owns_business_folder(folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.businesses where id::text = folder and owner_id = auth.uid());
$$;
revoke execute on function public.owns_business_folder(text) from public, anon;
grant execute on function public.owns_business_folder(text) to authenticated;

-- Let the business owner open their employees' files (documents and job
-- report photos). Files live at <business id>/<employee id>/...
drop policy if exists "documents readable by self and owner" on storage.objects;
create policy "documents readable by self and owner" on storage.objects for select to authenticated
  using (
    bucket_id = 'employee-documents'
    and (
      (storage.foldername(name))[2] = public.my_employee_id()::text
      or public.owns_business_folder((storage.foldername(name))[1])
    )
  );
