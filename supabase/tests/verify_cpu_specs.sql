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
end
$$;
