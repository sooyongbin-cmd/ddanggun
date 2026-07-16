do $$
begin
  if to_regclass('public.cpu_specs') is null then
    raise exception 'public.cpu_specs table was not created';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cpu_specs'
      and column_name in ('cpu_name', 'cores', 'threads', 'base_clock_ghz', 'boost_clock_ghz', 'performance_score')
    group by table_schema, table_name
    having count(*) = 6
  ) then
    raise exception 'public.cpu_specs is missing required CPU performance columns';
  end if;

  if (select count(*) from public.cpu_specs) < 240 then
    raise exception 'public.cpu_specs contains fewer than 240 seeded CPUs';
  end if;

  if exists (
    select 1
    from public.cpu_specs
    where cpu_name is null
       or cores is null
       or threads is null
       or source_url is null
  ) then
    raise exception 'seeded CPU specifications contain missing required values';
  end if;

  if not exists (
    select 1
    from public.cpu_specs
    where cpu_name = 'AMD Ryzen 5 5600'
      and cores = 6
      and threads = 12
      and base_clock_ghz = 3.5
      and boost_clock_ghz = 4.4
  ) then
    raise exception 'AMD Ryzen 5 5600 reference specification is incorrect or missing';
  end if;

  if not exists (
    select 1
    from public.cpu_specs
    where cpu_name = 'Intel Core i5-12400'
      and cores = 6
      and threads = 12
      and base_clock_ghz = 2.5
      and boost_clock_ghz = 4.4
  ) then
    raise exception 'Intel Core i5-12400 reference specification is incorrect or missing';
  end if;

  if not has_table_privilege('anon', 'public.cpu_specs', 'SELECT') then
    raise exception 'anon does not have read-only access to public.cpu_specs';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cpu_specs'
      and policyname = 'Public can read CPU specifications'
      and cmd = 'SELECT'
  ) then
    raise exception 'public.cpu_specs public SELECT policy is missing';
  end if;
end
$$;
