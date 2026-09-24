-- 포워더 추천 목록에서 본인 계정을 아예 뺀다.
--
-- 지금은 겸용(integrated) 계정으로 로그인하면 자기 자신이 후보로 뜬다.
-- 맨 뒤로 밀어두긴 했지만, 자기에게 의뢰한다는 선택지 자체가 화면에 있을 이유가 없다.
-- 다른 담당자가 하나도 없으면 목록이 비는데, 그때는 화면에서 이메일로 직접 찾으면 된다.
--
-- 반환 열은 그대로이므로 create or replace로 충분하다. 재실행해도 안전하다.

begin;

-- 정렬 기준:
--  1) 제휴 포워더 먼저
--  2) 요청 조건과 겹치는 특화 분야가 많은 순 (route_* 노선 · cargo_* 업무 적합성)
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
      -- 본인에게 의뢰하는 선택지는 만들지 않는다.
      and up.id <> (select auth.uid())
  )
  select
    c.id, c.company_name, c.contact_name,
    c.forwarder_specialties, c.matched,
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
