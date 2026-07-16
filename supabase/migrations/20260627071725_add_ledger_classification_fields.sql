alter table public.ledger
  add column if not exists bank_memo text not null default '',
  add column if not exists category text not null default '',
  add column if not exists category_detail text not null default '';
