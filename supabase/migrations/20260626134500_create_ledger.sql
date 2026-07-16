create extension if not exists "pgcrypto";

create table if not exists public.ledger (
  id uuid primary key default gen_random_uuid(),
  transaction_at timestamp without time zone not null unique,
  direction text not null check (direction in ('입금', '출금')),
  amount numeric(14, 0) not null check (amount >= 0),
  balance_after numeric(14, 0) not null,
  transaction_type text not null,
  description text not null default '',
  created_at timestamp with time zone not null default now()
);

alter table public.ledger enable row level security;
grant usage on schema public to authenticated;
grant select, insert on table public.ledger to authenticated;
create policy "Authenticated members can read ledger" on public.ledger for select to authenticated using (true);
create policy "Authenticated members can insert ledger" on public.ledger for insert to authenticated with check (true);
