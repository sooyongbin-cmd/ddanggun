grant select on table public.cpu_specs to anon, authenticated;

drop policy if exists "Public can read CPU specifications" on public.cpu_specs;

create policy "Public can read CPU specifications"
on public.cpu_specs
for select
to anon, authenticated
using (true);
