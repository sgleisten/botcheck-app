-- Additional admin users (super admin remains ADMIN_USER_ID in env).
create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists admin_users_email_idx on admin_users (lower(email));

comment on table admin_users is 'Non-super admins who may sign in at /admin. Super admin is always ADMIN_USER_ID from env.';

-- Soft-hide scans from the admin “Recent scans” list without deleting linked baseline/post scans.
alter table scans add column if not exists hidden_at timestamptz;

comment on column scans.hidden_at is 'When set, excluded from admin recent scans list. Scan row remains for client baseline/post links.';
