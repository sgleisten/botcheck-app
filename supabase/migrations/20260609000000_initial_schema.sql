create table clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  domain text not null,
  business_name text,
  contact_email text,
  plan text default 'starter',
  status text default 'onboarding',
  stripe_customer_id text,
  stripe_subscription_id text,
  agency_id uuid,
  dns_verified boolean default false,
  dns_verified_at timestamptz,
  last_scanned_at timestamptz,
  created_at timestamptz default now()
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  version integer default 1,
  status text default 'draft',
  llms_txt text,
  tools_json jsonb,
  robots_txt_additions text,
  crawl_data jsonb,
  questionnaire_answers jsonb,
  generated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table agencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  name text not null,
  contact_email text,
  stripe_customer_id text,
  stripe_subscription_id text,
  white_label_name text,
  white_label_logo_url text,
  per_site_price integer default 99,
  created_at timestamptz default now()
);

create table scans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  url text not null,
  scan_type text default 'free',
  ars_score integer,
  categories jsonb,
  top_failures jsonb,
  quick_wins jsonb,
  email text,
  diff jsonb,
  drift_detected boolean default false,
  alerts_sent jsonb default '[]',
  created_at timestamptz default now()
);
