-- Stage 2 destructive rebuild of the three application-owned trade tables.
--
-- SAFETY PRECONDITIONS:
-- 1. Verify the backups under supabase/backups and their SHA-256 hashes.
-- 2. Confirm remote counts: user_profiles=13, trades=11, trade_drafts=9.
-- 3. Apply only after explicit approval. This migration deliberately deletes
--    all rows in the three named public tables and does not migrate old data.
-- 4. auth.users, auth/storage schemas, and all other public tables are kept.
--
-- The old table shapes can be restored only with the matching schema and data
-- backups. See the rollback notes at the end of this file.

begin;

-- Remove the one auth trigger that depends on the profile trigger function.
-- The auth.users table and its data are not altered.
drop trigger if exists on_auth_user_created_create_profile on auth.users;

-- Drop only the three explicitly authorized application tables, in FK order.
drop table if exists public.trade_drafts;
drop table if exists public.trades;
drop table if exists public.user_profiles;

-- Retire the table-specific timestamp function after its trigger was dropped.
drop function if exists public.set_trade_drafts_updated_at();
drop function if exists public.set_trades_updated_at();

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user',
  service_role text not null default 'integrated',
  company_name text,
  company_address text,
  country text,
  business_number text,
  customs_clearance_code text,
  contact_name text,
  phone text,
  default_load_port text,
  default_discharge_port text,
  default_incoterm text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_service_role_check
    check (service_role in ('shipper', 'forwarder', 'integrated'))
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null,
  role text not null,
  status text not null,
  schema_version integer not null default 3,
  source_trade_id uuid references public.trades(id) on delete set null,
  form_data jsonb not null default '{}'::jsonb,
  workflow_data jsonb not null default '{}'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  document_data jsonb,
  issues jsonb not null default '[]'::jsonb,
  generated_at timestamptz,
  flow_completed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trades_direction_check
    check (direction in ('export', 'import')),
  constraint trades_role_check
    check (role in ('shipper', 'forwarder')),
  constraint trades_status_check
    check (status in ('generated', 'in_progress', 'submitted', 'failed'))
);

create table public.trade_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null,
  role text not null,
  trade_id uuid references public.trades(id) on delete set null,
  schema_version integer not null default 3,
  current_step integer not null default 1,
  form_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_drafts_direction_check
    check (direction in ('export', 'import')),
  constraint trade_drafts_role_check
    check (role in ('shipper', 'forwarder')),
  constraint trade_drafts_user_direction_role_key
    unique (user_id, direction, role)
);

create index trades_user_status_updated_idx
  on public.trades (user_id, status, updated_at desc);
create index trades_user_direction_role_created_idx
  on public.trades (user_id, direction, role, created_at desc);
create index trades_source_trade_id_idx
  on public.trades (source_trade_id);
create index trade_drafts_user_updated_idx
  on public.trade_drafts (user_id, updated_at desc);

comment on table public.user_profiles is
  'Application profile keyed to auth.users; rebuilt for the v3 trade workflow.';
comment on table public.trades is
  'Durable v3 trades. Draft state is represented only by rows in public.trade_drafts.';
comment on table public.trade_drafts is
  'At most one active v3 draft per user, direction, and role.';
comment on column public.trades.form_data is
  'TradeFormData v3: schemaVersion, direction, role, parties, items, terms, shipment, packaging, attachments.';
comment on column public.trade_drafts.form_data is
  'Same TradeFormData v3 contract as public.trades.form_data.';
comment on column public.trades.workflow_data is
  'Durable workflow data only; excludes loading, generating, and submitting UI state.';
comment on column public.trades.status is
  'Persistent states only: generated, in_progress, submitted, failed.';
comment on column public.trades.flow_completed_at is
  'Successful completion-button workflow timestamp; may precede submitted_at for import forwarders.';

alter table public.user_profiles enable row level security;
alter table public.trades enable row level security;
alter table public.trade_drafts enable row level security;

create policy user_profiles_select_own
  on public.user_profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy user_profiles_update_own
  on public.user_profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy trades_select_own
  on public.trades
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy trades_insert_own
  on public.trades
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy trades_update_own
  on public.trades
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy trades_delete_own
  on public.trades
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy trade_drafts_select_own
  on public.trade_drafts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy trade_drafts_insert_own
  on public.trade_drafts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy trade_drafts_update_own
  on public.trade_drafts
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy trade_drafts_delete_own
  on public.trade_drafts
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

create trigger set_trades_updated_at
  before update on public.trades
  for each row execute function public.set_updated_at();

create trigger set_trade_drafts_updated_at
  before update on public.trade_drafts
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (
    id,
    email,
    role,
    service_role,
    company_name,
    company_address,
    country,
    business_number,
    customs_clearance_code,
    contact_name,
    phone,
    default_load_port,
    default_discharge_port,
    default_incoterm,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    'user',
    case
      when new.raw_user_meta_data ->> 'service_role'
        in ('shipper', 'forwarder', 'integrated')
      then new.raw_user_meta_data ->> 'service_role'
      else 'integrated'
    end,
    nullif(new.raw_user_meta_data ->> 'company_name', ''),
    nullif(new.raw_user_meta_data ->> 'company_address', ''),
    nullif(new.raw_user_meta_data ->> 'country', ''),
    nullif(new.raw_user_meta_data ->> 'business_number', ''),
    nullif(new.raw_user_meta_data ->> 'customs_clearance_code', ''),
    nullif(new.raw_user_meta_data ->> 'contact_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'default_load_port', ''),
    nullif(new.raw_user_meta_data ->> 'default_discharge_port', ''),
    nullif(new.raw_user_meta_data ->> 'default_incoterm', ''),
    now(),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- auth.users is deliberately retained while the old profile rows are removed.
-- Recreate one profile row for every existing Auth user so current accounts can
-- immediately use the update-only profile flow after this migration.
insert into public.user_profiles (
  id,
  email,
  role,
  service_role,
  company_name,
  company_address,
  country,
  business_number,
  customs_clearance_code,
  contact_name,
  phone,
  default_load_port,
  default_discharge_port,
  default_incoterm,
  created_at,
  updated_at
)
select
  users.id,
  users.email,
  'user',
  case
    when users.raw_user_meta_data ->> 'service_role'
      in ('shipper', 'forwarder', 'integrated')
    then users.raw_user_meta_data ->> 'service_role'
    else 'integrated'
  end,
  nullif(users.raw_user_meta_data ->> 'company_name', ''),
  nullif(users.raw_user_meta_data ->> 'company_address', ''),
  nullif(users.raw_user_meta_data ->> 'country', ''),
  nullif(users.raw_user_meta_data ->> 'business_number', ''),
  nullif(users.raw_user_meta_data ->> 'customs_clearance_code', ''),
  nullif(users.raw_user_meta_data ->> 'contact_name', ''),
  nullif(users.raw_user_meta_data ->> 'phone', ''),
  nullif(users.raw_user_meta_data ->> 'default_load_port', ''),
  nullif(users.raw_user_meta_data ->> 'default_discharge_port', ''),
  nullif(users.raw_user_meta_data ->> 'default_incoterm', ''),
  now(),
  now()
from auth.users as users
on conflict (id) do nothing;

create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Authenticated clients receive only the operations supported by RLS policies.
revoke all on table public.user_profiles from anon, authenticated;
revoke all on table public.trades from anon, authenticated;
revoke all on table public.trade_drafts from anon, authenticated;
grant select, update on table public.user_profiles to authenticated;
grant select, insert, update, delete on table public.trades to authenticated;
grant select, insert, update, delete on table public.trade_drafts to authenticated;

-- Preserve administrative access for trusted Supabase service-role operations.
grant all on table public.user_profiles to service_role;
grant all on table public.trades to service_role;
grant all on table public.trade_drafts to service_role;

-- These functions are trigger entry points, not client RPC endpoints.
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

commit;

-- ROLLBACK / OLD-DATA RESTORE REFERENCE (never run automatically):
-- 1. Take a backup of any v3 data that must be retained.
-- 2. In one reviewed maintenance operation, drop
--    auth.users.on_auth_user_created_create_profile, then drop only
--    public.trade_drafts, public.trades, and public.user_profiles.
-- 3. Run supabase/backups/public_schema_before_trade_rebuild.sql.
-- 4. Restore data in this order:
--      a. user_profiles_data_before_trade_rebuild_utf8_verified.sql
--      b. trades_data_before_trade_rebuild_utf8_verified.sql
--      c. trade_drafts_data_before_trade_rebuild_utf8_verified.sql
-- 5. Verify counts 13/11/9 and compare policies/triggers with
--    policies_triggers_before_trade_rebuild.sql.
-- The old data files target the old composite table types and are intentionally
-- not loaded by this rebuild migration.
