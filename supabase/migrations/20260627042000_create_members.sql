create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamp with time zone not null default now()
);

alter table public.members enable row level security;
grant usage on schema public to authenticated, anon;
grant select, insert on table public.members to authenticated, anon;
create policy "Members can read members" on public.members for select to authenticated, anon using (true);
create policy "Members can insert members" on public.members for insert to authenticated, anon with check (true);
