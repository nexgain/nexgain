-- AI transaction sorting: transactions the quick rules weren't sure about are
-- read by Claude (the sort-transactions Edge Function), which saves its answer
-- with category_method 'claude'. This allows that value. Safe to run again.
alter table public.bank_transactions drop constraint if exists bank_transactions_method_check;
alter table public.bank_transactions add constraint bank_transactions_method_check
  check (category_method is null or category_method in ('rule', 'learned', 'ai', 'claude', 'owner'));
