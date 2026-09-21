-- 포워더 담당자 특화 분야 + 거래 조건 기반 담당자 자동 배정.
--
-- 지금까지 화주는 담당자 이메일을 알아야만 의뢰를 보낼 수 있었다(find_forwarder_by_email).
-- 처음 거래하는 화주는 누구에게 보내야 하는지 모른다. 거래에서 뽑은 조건(항로·화물 유형)과
-- 담당자 특화 분야를 맞춰 후보를 돌려주는 RPC를 둔다.
--
-- user_profiles는 본인 행만 select할 수 있으므로(RLS) 후보 조회는 security definer 함수로만 한다.
-- 돌려주는 값은 업체명·담당자명·특화 분야·건수뿐이다 — 이메일·연락처는 내보내지 않는다.
-- 재실행해도 안전하다.

begin;

alter table public.user_profiles
  add column if not exists forwarder_specialties text[] not null default '{}'::text[];

comment on column public.user_profiles.forwarder_specialties is
  'Forwarder staff specialties (route_*/cargo_*). Used only for shipper→forwarder auto assignment.';

alter table public.user_profiles
  drop constraint if exists user_profiles_forwarder_specialties_check;

alter table public.user_profiles
  add constraint user_profiles_forwarder_specialties_check
  check (forwarder_specialties <@ array[
    'route_cn', 'route_us', 'route_jp', 'route_vn', 'route_eu',
    'cargo_lcl', 'cargo_cold', 'cargo_dg', 'cargo_air'
  ]::text[]);

-- 정렬 기준:
--  1) 본인 계정은 맨 뒤 — 다른 담당자가 있으면 자기에게 배정하지 않는다
--     (겸용 계정 혼자 시연할 때는 본인만 남아 그대로 배정된다)
--  2) 요청 조건과 겹치는 특화 분야가 많은 순
--  3) p_prefer_experienced면 완료 건수 많은 순 (서류 불일치가 많은 까다로운 건)
--  4) 진행 중 건수 적은 순 — 업무 쏠림 방지
--  5) 완료 건수 많은 순
create or replace function public.match_forwarder_for_trade(
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
  completed_count integer
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
      coalesce(w.completed_count, 0) as completed_count
    from public.user_profiles up
    left join workload w on w.uid = up.id
    where up.service_role in ('forwarder', 'integrated')
  )
  select
    c.id, c.company_name, c.contact_name,
    c.forwarder_specialties, c.matched,
    c.active_count, c.completed_count
  from candidates c
  order by
    (c.id = (select auth.uid())) asc,
    cardinality(c.matched) desc,
    case when p_prefer_experienced then c.completed_count else 0 end desc,
    c.active_count asc,
    c.completed_count desc,
    c.id
  limit 3;
end;
$$;

revoke all on function public.match_forwarder_for_trade(uuid, text[], boolean) from public, anon;
grant execute on function public.match_forwarder_for_trade(uuid, text[], boolean) to authenticated;

commit;
