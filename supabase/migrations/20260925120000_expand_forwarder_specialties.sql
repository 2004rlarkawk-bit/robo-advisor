-- 담당 특화 분야를 넓힌다.
--
-- 두 가지를 바꾼다.
--  1) 미리 고른 목록에 노선 6개(동남아·대만홍콩·인도서남아·중동·러시아CIS·중남미)와
--     업무 3개(FCL·중량물/특수·특송/이커머스)를 더한다. 이 키들은 거래 정보(항구 국가·적재 방식)에서
--     뽑아낼 수 있어 자동 배정 점수에 그대로 들어간다.
--  2) 목록에 없는 분야를 담당자가 직접 적는 칸(forwarder_specialties_custom)을 만든다.
--     반송·삼국간 무역·전시화물처럼 목록으로 다 담을 수 없는 업무가 있다. 직접 적은 말은
--     화주에게 보여만 주고 자동 배정 점수에는 넣지 않는다 — 거래 정보에서 같은 말을
--     뽑아낼 방법이 없어 점수에 넣으면 아무 조건에나 걸리는 꼴이 되기 때문이다.
--
-- 기존 값은 전부 새 목록에도 들어 있어 데이터 이전이 필요 없다. 재실행해도 안전하다.

begin;

alter table public.user_profiles
  add column if not exists forwarder_specialties_custom text[] not null default '{}'::text[];

comment on column public.user_profiles.forwarder_specialties_custom is
  'Free-text specialties typed by the forwarder. Shown to shippers, never used for auto assignment.';

alter table public.user_profiles
  drop constraint if exists user_profiles_forwarder_specialties_custom_check;

-- 화면과 같은 한도(5개 · 각 20자). 빈 문자열은 칩이 비어 보이므로 막는다.
-- CHECK 안에는 서브쿼리를 쓸 수 없어(unnest로 훑는 일도 서브쿼리다) 불변 함수로 뺀다.
create or replace function public.forwarder_custom_specialties_ok(p_values text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    bool_and(btrim(s) <> '' and char_length(s) <= 20),
    true  -- 빈 배열이면 bool_and가 null이라 통과로 본다
  )
  from unnest(coalesce(p_values, '{}'::text[])) as s;
$$;

alter table public.user_profiles
  add constraint user_profiles_forwarder_specialties_custom_check
  check (
    cardinality(forwarder_specialties_custom) <= 5
    and public.forwarder_custom_specialties_ok(forwarder_specialties_custom)
  );

alter table public.user_profiles
  drop constraint if exists user_profiles_forwarder_specialties_check;

alter table public.user_profiles
  add constraint user_profiles_forwarder_specialties_check
  check (forwarder_specialties <@ array[
    'route_cn', 'route_us', 'route_jp', 'route_vn', 'route_sea', 'route_twhk',
    'route_in', 'route_eu', 'route_me', 'route_cis', 'route_latam',
    'cargo_fcl', 'cargo_lcl', 'cargo_cold', 'cargo_dg', 'cargo_air',
    'cargo_oog', 'cargo_express'
  ]::text[]);

-- 후보 목록에 직접 적은 분야를 함께 내려준다.
-- 반환 열이 늘어나 create or replace로는 바꿀 수 없어 지웠다 다시 만든다.
-- 정렬 기준은 그대로:
--  1) 제휴 포워더 먼저
--  2) 요청 조건과 겹치는 특화 분야가 많은 순 (직접 적은 분야는 여기 들어가지 않는다)
--  3) p_prefer_experienced면 완료 건수 많은 순
--  4) 진행 중 건수 적은 순 — 업무 쏠림 방지
--  5) 완료 건수 많은 순
drop function if exists public.match_forwarder_for_trade(uuid, text[], boolean);

create function public.match_forwarder_for_trade(
  p_trade_id uuid,
  p_specialties text[],
  p_prefer_experienced boolean default false
)
returns table (
  id uuid,
  company_name text,
  contact_name text,
  specialties text[],
  matched_specialties text[],
  custom_specialties text[],
  active_count integer,
  completed_count integer,
  is_partner_forwarder boolean,
  partner_company_name text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.trades t
    where t.id = p_trade_id and t.user_id = (select auth.uid())
  ) then
    raise exception 'match_forwarder_for_trade: trade not found or not owned by caller';
  end if;

  return query
  with workload as (
    select
      t.forwarder_user_id as uid,
      count(*) filter (where not s.done)::integer as active_count,
      count(*) filter (where s.done)::integer as completed_count
    from public.trades t
    cross join lateral (
      select (
        t.workflow_data #>> '{forwarderCase,stage}' = 'done'
        or nullif(t.workflow_data #>> '{exportForwarderCase,completedAt}', '') is not null
      ) is true as done
    ) s
    where t.forwarder_user_id is not null
    group by t.forwarder_user_id
  ),
  candidates as (
    select
      up.id,
      up.company_name,
      up.contact_name,
      up.forwarder_specialties,
      array(
        select s from unnest(up.forwarder_specialties) s
        where s = any(coalesce(p_specialties, '{}'::text[]))
      ) as matched,
      coalesce(up.forwarder_specialties_custom, '{}'::text[]) as custom,
      coalesce(w.active_count, 0) as active_count,
      coalesce(w.completed_count, 0) as completed_count,
      up.is_partner_forwarder,
      up.partner_company_name
    from public.user_profiles up
    left join workload w on w.uid = up.id
    where up.service_role in ('forwarder', 'integrated')
      -- 본인에게 의뢰하는 선택지는 만들지 않는다.
      and up.id <> (select auth.uid())
  )
  select
    c.id, c.company_name, c.contact_name,
    c.forwarder_specialties, c.matched, c.custom,
    c.active_count, c.completed_count,
    c.is_partner_forwarder, c.partner_company_name
  from candidates c
  order by
    c.is_partner_forwarder desc,
    cardinality(c.matched) desc,
    case when p_prefer_experienced then c.completed_count else 0 end desc,
    c.active_count asc,
    c.completed_count desc,
    c.id
  limit 5;
end;
$$;

revoke all on function public.match_forwarder_for_trade(uuid, text[], boolean) from public, anon;
grant execute on function public.match_forwarder_for_trade(uuid, text[], boolean) to authenticated;

commit;
