-- 로그인 사용자별 작성 중 거래 초안. 기존 테이블과 데이터는 삭제하지 않습니다.
create table if not exists public.trade_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 같은 이름의 테이블이 일부 컬럼만 가진 환경도 안전하게 보완합니다.
alter table public.trade_drafts
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists profile jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists trade_drafts_user_id_unique
  on public.trade_drafts (user_id);

alter table public.trade_drafts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trade_drafts' and policyname = 'trade_drafts_select_own'
  ) then
    execute 'create policy trade_drafts_select_own on public.trade_drafts for select to authenticated using ((select auth.uid()) = user_id)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trade_drafts' and policyname = 'trade_drafts_insert_own'
  ) then
    execute 'create policy trade_drafts_insert_own on public.trade_drafts for insert to authenticated with check ((select auth.uid()) = user_id)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trade_drafts' and policyname = 'trade_drafts_update_own'
  ) then
    execute 'create policy trade_drafts_update_own on public.trade_drafts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trade_drafts' and policyname = 'trade_drafts_delete_own'
  ) then
    execute 'create policy trade_drafts_delete_own on public.trade_drafts for delete to authenticated using ((select auth.uid()) = user_id)';
  end if;
end
$$;

grant select, insert, update, delete on public.trade_drafts to authenticated;

create or replace function public.set_trade_drafts_updated_at()
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
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_trade_drafts_updated_at'
      and tgrelid = 'public.trade_drafts'::regclass
      and not tgisinternal
  ) then
    create trigger set_trade_drafts_updated_at
      before update on public.trade_drafts
      for each row execute function public.set_trade_drafts_updated_at();
  end if;
end
$$;
