grant usage on schema public to anon;
grant select, insert on table public.ledger to anon;
create policy "Anonymous members can read ledger" on public.ledger for select to anon using (true);
create policy "Anonymous members can insert ledger" on public.ledger for insert to anon with check (true);
