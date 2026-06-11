-- Per-client billing and custom checkout links
alter table clients
  add column if not exists billing_type text not null default 'standard'
    check (billing_type in ('standard', 'custom_checkout', 'invoice', 'comped')),
  add column if not exists stripe_price_id text,
  add column if not exists quoted_monthly_cents integer,
  add column if not exists checkout_token text unique;

create index if not exists clients_checkout_token_idx
  on clients (checkout_token)
  where checkout_token is not null;

comment on column clients.billing_type is 'standard | custom_checkout | invoice | comped';
comment on column clients.stripe_price_id is 'Stripe Price ID for this client/plan tier';
comment on column clients.quoted_monthly_cents is 'Quoted monthly amount in cents (audit + custom Checkout)';
comment on column clients.checkout_token is 'Secret token for /checkout/{token} private link';
