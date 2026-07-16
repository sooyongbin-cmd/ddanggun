grant update, delete on table public.ledger to authenticated, anon;
create policy "Authenticated members can update ledger" on public.ledger for update to authenticated using (true) with check (true);
create policy "Authenticated members can delete ledger" on public.ledger for delete to authenticated using (true);
create policy "Anonymous members can update ledger" on public.ledger for update to anon using (true) with check (true);
create policy "Anonymous members can delete ledger" on public.ledger for delete to anon using (true);
