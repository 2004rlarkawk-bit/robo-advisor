-- 제휴 포워더 구분 + 추천 우선순위 반영.
--
-- 지금 match_forwarder_for_trade는 가입한 포워더 전체를 특화 분야·업무량으로만 정렬한다.
-- 초기에는 가입 포워더가 거의 없어 화주가 받을 추천이 비거나 낯선 담당자만 나온다.
-- PortAI가 제휴를 맺은 담당자를 먼저 보여주고, 그다음 일반 가입 담당자를 후순위로 붙인다.
--
-- 시스템이 확정하지 않고 화주가 고르는 방식이라, 함수는 후보를 "추천 순서대로" 돌려주기만 한다.
-- 회사-회원 관계 테이블(forwarder_companies/…_members)은 나중에 필요할 때 분리한다.
-- 재실행해도 안전하다.

begin;

alter table public.user_profiles
  add column if not exists is_partner_forwarder boolean not null default false;

comment on column public.user_profiles.is_partner_forwarder is
  'PortAI partner (MOU) forwarder staff. Recommended first in shipper→forwarder matching.';

alter table public.user_profiles
  add column if not exists partner_company_name text;

comment on column public.user_profiles.partner_company_name is
  'Partner company name to show when it differs from the staff profile company_name.';

-- 반환 열이 늘어나므로 교체 전에 드롭해야 한다(create or replace로는 OUT 파라미터를 바꿀 수 없다).
drop function if exists public.match_forwarder_for_trade(uuid, text[], boolean);

-- 정렬 기준:
--  1) 본인 계정은 맨 뒤 — 다른 담당자가 있으면 자기에게 추천하지 않는다
--     (겸용 계정 혼자 시연할 때는 본인만 남아 그대로 추천된다)
--  2) 제휴 포워더 먼저
--  3) 요청 조건과 겹치는 특화 분야가 많은 순 (route_* 노선 · cargo_* 업무 적합성)
--  4) p_prefer_experienced면 완료 건수 많은 순 (서류 불일치가 많은 까다로운 건)
--  5) 진행 중 건수 적은 순 — 업무 쏠림 방지
--  6) 완료 건수 많은 순
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
      coalesce(w.active_count, 0) as active_count,
      coalesce(w.completed_count, 0) as completed_count,
      up.is_partner_forwarder,
      up.partner_company_name
    from public.user_profiles up
    left join workload w on w.uid = up.id
    where up.service_role in ('forwarder', 'integrated')
  )
  select
    c.id, c.company_name, c.contact_name,
    c.forwarder_specialties, c.matched,
    c.active_count, c.completed_count,
    c.is_partner_forwarder, c.partner_company_name
  from candidates c
  order by
    (c.id = (select auth.uid())) asc,
    c.is_partner_forwarder desc,
    cardinality(c.matched) desc,
    case when p_prefer_experienced then c.completed_count else 0 end desc,
    c.active_count asc,
    c.completed_count desc,
    c.id
  -- 제휴 담당자 뒤에 일반 가입 담당자도 후순위 후보로 보이도록 3건에서 늘린다.
  limit 5;
end;
$$;

revoke all on function public.match_forwarder_for_trade(uuid, text[], boolean) from public, anon;
grant execute on function public.match_forwarder_for_trade(uuid, text[], boolean) to authenticated;

commit;
