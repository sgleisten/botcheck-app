-- Consolidated client workspace: granular brand-visibility results + dated report snapshots.

-- One row per (prompt x model) brand-visibility test, so we can show exactly which
-- prompt was run, against which LLM, and whether the business was mentioned.
create table if not exists brand_visibility_results (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  phase text not null default 'baseline', -- baseline | post_delivery
  prompt text not null,
  model text not null,
  mentioned boolean not null default false,
  response_excerpt text,
  notes text,
  created_at timestamptz default now()
);

create index if not exists brand_visibility_results_client_idx
  on brand_visibility_results(client_id);

alter table brand_visibility_results enable row level security;
-- No public policies: only service_role (server-side admin) reads/writes.

-- Frozen, dated snapshot of a client's state so you can keep a pre-work record
-- and a post-work record and print either as a PDF.
create table if not exists client_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  phase text not null default 'pre', -- pre | post
  label text,
  ars_score integer,
  site_readiness integer,
  discoverability_score integer,
  findings jsonb default '{}'::jsonb,       -- { top_failures, quick_wins, categories }
  brand_summary jsonb default '{}'::jsonb,  -- { model_count, mention_count, results: [...] }
  captured_at timestamptz default now()
);

create index if not exists client_report_snapshots_client_idx
  on client_report_snapshots(client_id);

alter table client_report_snapshots enable row level security;
-- No public policies: only service_role (server-side admin) reads/writes.
