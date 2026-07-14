-- Simple key/value store for admin-configurable app settings (e.g. the deployed
-- ai-brand-visibility-template worker URL), so they can be set from the UI without
-- an env var + redeploy.
create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;
-- No public policies: only service_role (server-side admin) reads/writes.
