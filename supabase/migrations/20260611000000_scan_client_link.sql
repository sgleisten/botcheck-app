alter table clients add column if not exists scan_id uuid references scans(id);
alter table scans add column if not exists site_snapshot jsonb;
