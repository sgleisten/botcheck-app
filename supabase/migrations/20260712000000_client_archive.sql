-- Soft-delete for clients: admin can archive/unarchive without touching
-- profiles or scans (no cascade, fully reversible).
alter table clients add column if not exists archived_at timestamptz;

comment on column clients.archived_at is 'Set when an admin archives (soft-deletes) a client. Null = active/visible.';
