-- Cloudflare for SaaS custom hostnames: map a client's own subdomain
-- (e.g. ai.midstatehealth.net) to their client record, and track Cloudflare's
-- verification / cert-issuance state so the admin + onboarding UI can show it.
alter table clients
  add column if not exists custom_hostname text unique,
  add column if not exists custom_hostname_status text default 'pending'
    check (custom_hostname_status in ('pending', 'active', 'error')),
  add column if not exists cf_hostname_id text,
  add column if not exists custom_hostname_error text;

comment on column clients.custom_hostname is 'Client-owned subdomain served via Cloudflare for SaaS (e.g. ai.example.com).';
comment on column clients.custom_hostname_status is 'Cloudflare verification state: pending | active | error.';
comment on column clients.cf_hostname_id is 'Cloudflare Custom Hostname ID — used to poll status or delete/re-register.';
comment on column clients.custom_hostname_error is 'Cloudflare verification error detail, surfaced in the UI when status = error.';

-- The hostname-lookup edge function filters live traffic on this column.
create index if not exists clients_custom_hostname_idx
  on clients (custom_hostname)
  where custom_hostname is not null;
