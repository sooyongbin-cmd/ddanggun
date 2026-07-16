create table public.cpu_specs (
  id bigint generated always as identity primary key,
  cpu_name text not null,
  manufacturer text,
  architecture text,
  cores smallint,
  threads smallint,
  base_clock_ghz numeric(4, 2),
  boost_clock_ghz numeric(4, 2),
  cache_mb numeric(8, 2),
  tdp_watts numeric(7, 2),
  performance_score smallint,
  single_core_score integer,
  multi_core_score integer,
  benchmark_name text,
  benchmark_version text,
  source_url text,
  measured_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint cpu_specs_name_not_blank check (length(btrim(cpu_name)) > 0),
  constraint cpu_specs_cores_range check (cores is null or cores between 1 and 256),
  constraint cpu_specs_threads_range check (threads is null or threads between 1 and 512),
  constraint cpu_specs_threads_gte_cores check (cores is null or threads is null or threads >= cores),
  constraint cpu_specs_base_clock_range check (base_clock_ghz is null or base_clock_ghz > 0 and base_clock_ghz <= 20),
  constraint cpu_specs_boost_clock_range check (boost_clock_ghz is null or boost_clock_ghz > 0 and boost_clock_ghz <= 20),
  constraint cpu_specs_boost_gte_base check (base_clock_ghz is null or boost_clock_ghz is null or boost_clock_ghz >= base_clock_ghz),
  constraint cpu_specs_cache_positive check (cache_mb is null or cache_mb > 0),
  constraint cpu_specs_tdp_positive check (tdp_watts is null or tdp_watts > 0),
  constraint cpu_specs_performance_range check (performance_score is null or performance_score between 0 and 100),
  constraint cpu_specs_single_core_nonnegative check (single_core_score is null or single_core_score >= 0),
  constraint cpu_specs_multi_core_nonnegative check (multi_core_score is null or multi_core_score >= 0)
);

create unique index cpu_specs_cpu_name_lower_uidx on public.cpu_specs (lower(cpu_name));
create index cpu_specs_performance_score_idx on public.cpu_specs (performance_score desc nulls last);
create index cpu_specs_multi_core_score_idx on public.cpu_specs (multi_core_score desc nulls last);

comment on table public.cpu_specs is 'CPU identification, specifications, and normalized performance data';
comment on column public.cpu_specs.performance_score is 'Normalized CPU performance score from 0 to 100';
comment on column public.cpu_specs.single_core_score is 'Raw single-core benchmark score identified by benchmark_name and benchmark_version';
comment on column public.cpu_specs.multi_core_score is 'Raw multi-core benchmark score identified by benchmark_name and benchmark_version';

alter table public.cpu_specs enable row level security;
revoke all on table public.cpu_specs from anon, authenticated;
grant select, insert, update, delete on table public.cpu_specs to service_role;
grant usage, select on sequence public.cpu_specs_id_seq to service_role;
