-- Buxton SignFlow Supabase starter schema.
-- Run this in the Supabase SQL editor for the new free-first backend.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null default 'admin',
  avatar_file_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text,
  customer_phone text,
  membership_number text,
  lead_number text,
  address_line text,
  city text,
  state text,
  zip text,
  year_home_built text,
  consultation_date date,
  right_to_cancel_date date,
  approximate_start_date date,
  approximate_completion_date date,
  contract_total numeric(12, 2),
  shop_card numeric(12, 2),
  shop_card_percentage numeric(5, 2),
  status text not null default 'draft',
  email_sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_statuses (
  id bigserial primary key,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.contract_activity_logs (
  id bigserial primary key,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  activity_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.contract_files (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts(id) on delete cascade,
  file_kind text not null,
  bucket text not null,
  object_key text not null,
  original_filename text,
  content_type text,
  size_bytes bigint,
  checksum text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sender_settings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  sender_name text not null,
  sender_title text,
  reply_to_email text not null,
  phone text,
  headshot_file_id uuid references public.contract_files(id),
  email_subject text not null default 'Your contract is ready to review',
  email_message text,
  button_text text not null default 'Review and Sign',
  closing text,
  signed_copy_delivery_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  active boolean not null default false,
  file_id uuid references public.contract_files(id),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.email_events (
  id bigserial primary key,
  contract_id uuid references public.contracts(id) on delete cascade,
  event_type text not null,
  provider_message_id text,
  recipient_email text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contracts_status_idx on public.contracts(status);
create index if not exists contracts_customer_idx on public.contracts(customer_name);
create index if not exists contract_files_contract_idx on public.contract_files(contract_id);
create index if not exists contract_activity_contract_idx on public.contract_activity_logs(contract_id);

alter table public.profiles enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_statuses enable row level security;
alter table public.contract_activity_logs enable row level security;
alter table public.contract_files enable row level security;
alter table public.sender_settings enable row level security;
alter table public.templates enable row level security;
alter table public.email_events enable row level security;

-- Starter policies: authenticated team members can read/write app data.
-- Tighten these by role before a final public launch.
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id);

create policy "contracts_all_authenticated" on public.contracts
  for all to authenticated using (true) with check (true);

create policy "contract_statuses_all_authenticated" on public.contract_statuses
  for all to authenticated using (true) with check (true);

create policy "activity_all_authenticated" on public.contract_activity_logs
  for all to authenticated using (true) with check (true);

create policy "files_all_authenticated" on public.contract_files
  for all to authenticated using (true) with check (true);

create policy "settings_all_authenticated" on public.sender_settings
  for all to authenticated using (true) with check (true);

create policy "templates_all_authenticated" on public.templates
  for all to authenticated using (true) with check (true);

create policy "email_events_all_authenticated" on public.email_events
  for all to authenticated using (true) with check (true);

