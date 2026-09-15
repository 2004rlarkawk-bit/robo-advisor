-- 겸용(화주+포워더, integrated) 계정이 한 계정으로 전체 흐름을 시연할 수 있도록
-- "본인에게 의뢰하기"를 허용한다.
--  1) find_forwarder_by_email: 본인 계정 제외 조건을 없애 자기 이메일 검색이 뜨게 한다.
--     (forwarder/integrated 역할 제한은 유지 — 화주 전용 계정은 여전히 검색되지 않는다)
--  2) trade_requests: 요청자=수신자를 막던 체크 제약을 제거해 본인 의뢰 생성이 가능하게 한다.
--     중복 pending 방지 유니크 인덱스와 RLS는 그대로 유효하다.

begin;

create or replace function public.find_forwarder_by_email(p_email text)
returns table (
  id uuid,
  company_name text,
  contact_name text,
  service_role text
)
language sql
security definer
stable
set search_path = public
as $$
  select up.id, up.company_name, up.contact_name, up.service_role
  from public.user_profiles up
  where lower(up.email) = lower(p_email)
    and up.service_role in ('forwarder', 'integrated')
  limit 1;
$$;

alter table public.trade_requests
  drop constraint if exists trade_requests_requester_receiver_diff;

commit;
