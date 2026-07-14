-- Stored CSV exports from the Cloudflare ai-brand-visibility-template tool.

create table if not exists brand_visibility_exports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  phase text not null default 'baseline', -- baseline | post_delivery
  filename text not null,
  csv_content text not null,
  row_count integer not null default 0,
  mention_count integer not null default 0,
  source text not null default 'upload', -- upload | cloudflare_fetch
  cloudflare_result_id text,
  label text,
  created_at timestamptz default now()
);

create index if not exists brand_visibility_exports_client_idx
  on brand_visibility_exports(client_id);

alter table brand_visibility_exports enable row level security;
-- No public policies: only service_role (server-side admin) reads/writes.
