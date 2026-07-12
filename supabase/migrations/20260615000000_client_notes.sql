-- Operator-only notes on a client record (manual onboarding / reference).
alter table clients add column if not exists notes text;

comment on column clients.notes is 'Operator reference notes — not shown to the customer.';
