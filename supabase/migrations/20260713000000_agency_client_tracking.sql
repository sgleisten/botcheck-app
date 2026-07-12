-- Agency workflow: before/after scans, hosting access flag, brand visibility records

alter table clients add column if not exists baseline_scan_id uuid references scans(id);
alter table clients add column if not exists post_delivery_scan_id uuid references scans(id);
alter table clients add column if not exists hosting_access boolean default false;

create table if not exists brand_checks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  check_type text not null default 'baseline',
  mention_count integer not null default 0,
  model_count integer not null default 5,
  prompts jsonb default '[]',
  results jsonb default '{}',
  notes text,
  created_at timestamptz default now()
);

create index if not exists brand_checks_client_id_idx on brand_checks(client_id);

alter table brand_checks enable row level security;
-- No public policies: only service_role (server-side admin) can read/write brand_checks.
