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
      and column_name in ('cpu_name', 'cores', 'threads', 'base_clock_ghz', 'boost_clock_ghz', 'performance_score', 'performance_rank')
    group by table_schema, table_name
    having count(*) = 7
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

  if exists (
    select 1
    from public.cpu_specs
    where performance_rank is null
       or performance_score is null
       or single_core_score is null
       or multi_core_score is null
       or benchmark_name is null
  ) then
    raise exception 'CPU performance ranking contains missing values';
  end if;

  if (
    select count(*) = count(distinct performance_rank)
       and min(performance_rank) = 1
       and max(performance_rank) = count(*)
    from public.cpu_specs
  ) is not true then
    raise exception 'CPU performance ranks are not unique and contiguous';
  end if;

  if not exists (
    select 1
    from public.cpu_specs
    where cpu_name = 'AMD Ryzen 9 9950X3D'
      and performance_rank = 1
      and single_core_score = 3393
      and multi_core_score = 22168
      and benchmark_name = 'Geekbench 6'
  ) then
    raise exception 'CPU ranking reference row is incorrect or missing';
  end if;

  if (select count(*) from public.cpu_specs where benchmark_name like '%estimate%') <> 18 then
    raise exception 'unexpected count of specification-based CPU benchmark estimates';
  end if;
end
$$;
