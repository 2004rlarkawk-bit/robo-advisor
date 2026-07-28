-- UI/입력 구조 개편 이후의 목표 스키마 설계안입니다.
-- 이 파일은 검토 및 향후 마이그레이션 작성용이며 이번 작업에서 실행하지 않았습니다.
-- 기존 객체를 삭제하거나 데이터를 초기화하는 구문은 포함하지 않습니다.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user',
  company_name text,
  company_address text,
  business_number text,
  customs_clearance_code text,
  contact_name text,
  phone text,
  country text,
  default_load_port text,
  default_discharge_port text,
  default_incoterm text,
  service_role text not null default 'integrated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists email text,
  add column if not exists role text not null default 'user',
  add column if not exists company_name text,
  add column if not exists company_address text,
  add column if not exists business_number text,
  add column if not exists customs_clearance_code text,
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists country text,
  add column if not exists default_load_port text,
  add column if not exists default_discharge_port text,
  add column if not exists default_incoterm text,
  add column if not exists service_role text not null default 'integrated',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_role_check') then
    alter table public.user_profiles add constraint user_profiles_role_check
      check (role in ('user', 'admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_service_role_check') then
    alter table public.user_profiles add constraint user_profiles_service_role_check
      check (service_role in ('shipper', 'forwarder', 'integrated'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_default_incoterm_check') then
    alter table public.user_profiles add constraint user_profiles_default_incoterm_check
      check (default_incoterm is null or default_incoterm in ('FOB', 'CIF', 'EXW', 'DDP', 'DAP', 'FCA'));
  end if;
end
$$;

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  generated_docs jsonb,
  issues jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  generated_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trades
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists profile jsonb not null default '{}'::jsonb,
  add column if not exists documents jsonb not null default '[]'::jsonb,
  add column if not exists generated_docs jsonb,
  add column if not exists issues jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'draft',
  add column if not exists generated_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trades_status_check') then
    alter table public.trades add constraint trades_status_check
      check (status in ('draft', 'generated', 'submitted'));
  end if;
end
$$;

create index if not exists trades_user_id_created_at_idx
  on public.trades (user_id, created_at desc);
create index if not exists trades_user_id_status_idx
  on public.trades (user_id, status);

create table if not exists public.trade_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists trade_drafts_user_id_unique
  on public.trade_drafts (user_id);

alter table public.user_profiles enable row level security;
alter table public.trades enable row level security;
alter table public.trade_drafts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'user_profiles_select_own') then
    create policy user_profiles_select_own on public.user_profiles
      for select to authenticated using ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'user_profiles_update_own') then
    create policy user_profiles_update_own on public.user_profiles
      for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trades' and policyname = 'trades_select_own') then
    create policy trades_select_own on public.trades
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trades' and policyname = 'trades_insert_own') then
    create policy trades_insert_own on public.trades
      for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trades' and policyname = 'trades_update_own') then
    create policy trades_update_own on public.trades
      for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trades' and policyname = 'trades_delete_own') then
    create policy trades_delete_own on public.trades
      for delete to authenticated using ((select auth.uid()) = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trade_drafts' and policyname = 'trade_drafts_select_own') then
    create policy trade_drafts_select_own on public.trade_drafts
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trade_drafts' and policyname = 'trade_drafts_insert_own') then
    create policy trade_drafts_insert_own on public.trade_drafts
      for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trade_drafts' and policyname = 'trade_drafts_update_own') then
    create policy trade_drafts_update_own on public.trade_drafts
      for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trade_drafts' and policyname = 'trade_drafts_delete_own') then
    create policy trade_drafts_delete_own on public.trade_drafts
      for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end
$$;

grant select, update on public.user_profiles to authenticated;
grant select, insert, update, delete on public.trades to authenticated;
grant select, insert, update, delete on public.trade_drafts to authenticated;

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

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_user_profiles_updated_at' and tgrelid = 'public.user_profiles'::regclass and not tgisinternal) then
    create trigger set_user_profiles_updated_at before update on public.user_profiles
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_trades_updated_at' and tgrelid = 'public.trades'::regclass and not tgisinternal) then
    create trigger set_trades_updated_at before update on public.trades
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_trade_drafts_updated_at' and tgrelid = 'public.trade_drafts'::regclass and not tgisinternal) then
    create trigger set_trade_drafts_updated_at before update on public.trade_drafts
      for each row execute function public.set_updated_at();
  end if;
end
$$;

create or replace function public.handle_new_user_profile()
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
    company_name,
    contact_name,
    service_role
  ) values (
    new.id,
    coalesce(new.email, ''),
    'user',
    nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'contact_name'), ''),
    case
      when new.raw_user_meta_data ->> 'service_role' in ('shipper', 'forwarder', 'integrated')
        then new.raw_user_meta_data ->> 'service_role'
      else 'integrated'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created_create_profile'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    create trigger on_auth_user_created_create_profile
      after insert on auth.users
      for each row execute function public.handle_new_user_profile();
  end if;
end
$$;
