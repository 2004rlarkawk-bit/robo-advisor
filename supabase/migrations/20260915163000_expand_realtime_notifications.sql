-- 역할별 업무 알림을 실제 거래 흐름에 연결한다.
--  - 포워더: 신규 의뢰, 화주 보완 회신
--  - 화주: 의뢰 수락/거절, 포워더 보완 요청, 포워더 업무 완료
-- notifications는 클라이언트가 직접 생성할 수 없고 DB 트리거만 insert한다.

begin;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'trade_request_received',
    'trade_request_accepted',
    'trade_request_rejected',
    'trade_return_requested',
    'trade_return_replied',
    'trade_forwarder_completed'
  ));

-- 기존 의뢰 알림에도 회사·품목·B/L 정보를 넣어 알림 목록만 보고 대상을 구분한다.
create or replace function public.notify_trade_request_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade public.trades;
  v_company text;
  v_contact text;
  v_payload jsonb;
begin
  select * into v_trade from public.trades where id = new.trade_id;

  if tg_op = 'INSERT' then
    select company_name, contact_name into v_company, v_contact
      from public.user_profiles where id = new.requester_user_id;
    v_payload := jsonb_build_object(
      'requester_company', coalesce(v_company, ''),
      'requester_contact', coalesce(v_contact, ''),
      'direction', coalesce(v_trade.direction, ''),
      'item_name', coalesce(v_trade.form_data #>> '{items,0,description}', ''),
      'bl_no', coalesce(
        v_trade.document_data #>> '{importTrade,analysis,extracted,blNo}',
        v_trade.form_data #>> '{shipment,billOfLadingNo}',
        ''
      )
    );
    insert into public.notifications (recipient_user_id, type, trade_request_id, trade_id, payload)
    values (new.receiver_user_id, 'trade_request_received', new.id, new.trade_id, v_payload);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    select company_name, contact_name into v_company, v_contact
      from public.user_profiles where id = new.receiver_user_id;
    v_payload := jsonb_build_object(
      'forwarder_company', coalesce(v_company, ''),
      'forwarder_contact', coalesce(v_contact, ''),
      'direction', coalesce(v_trade.direction, ''),
      'item_name', coalesce(v_trade.form_data #>> '{items,0,description}', ''),
      'bl_no', coalesce(
        v_trade.document_data #>> '{importTrade,analysis,extracted,blNo}',
        v_trade.form_data #>> '{shipment,billOfLadingNo}',
        ''
      )
    );
    if new.status = 'accepted' then
      insert into public.notifications (recipient_user_id, type, trade_request_id, trade_id, payload)
      values (new.requester_user_id, 'trade_request_accepted', new.id, new.trade_id, v_payload);
    elsif new.status = 'rejected' then
      insert into public.notifications (recipient_user_id, type, trade_request_id, trade_id, payload)
      values (new.requester_user_id, 'trade_request_rejected', new.id, new.trade_id, v_payload);
    end if;
  end if;
  return new;
end;
$$;

-- 수입 업무의 workflow_data.forwarderCase 변화를 양측 알림으로 변환한다.
create or replace function public.notify_trade_workflow_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_request jsonb := old.workflow_data #> '{forwarderCase,returnRequest}';
  v_new_request jsonb := new.workflow_data #> '{forwarderCase,returnRequest}';
  v_old_stage text := old.workflow_data #>> '{forwarderCase,stage}';
  v_new_stage text := new.workflow_data #>> '{forwarderCase,stage}';
  v_company text;
  v_payload jsonb;
  v_bl_no text := coalesce(
    new.document_data #>> '{importTrade,analysis,extracted,blNo}',
    new.form_data #>> '{shipment,billOfLadingNo}',
    ''
  );
  v_item_name text := coalesce(new.form_data #>> '{items,0,description}', '');
begin
  -- 포워더가 새 보완 요청을 남긴 순간 화주에게 알린다.
  if v_new_request is not null
    and (v_old_request is null
      or v_new_request #>> '{requestedAt}' is distinct from v_old_request #>> '{requestedAt}')
  then
    select company_name into v_company from public.user_profiles where id = new.forwarder_user_id;
    v_payload := jsonb_build_object(
      'forwarder_company', coalesce(v_company, ''),
      'item_name', v_item_name,
      'bl_no', v_bl_no
    );
    insert into public.notifications (recipient_user_id, type, trade_id, payload)
    values (new.user_id, 'trade_return_requested', new.id, v_payload);
  end if;

  -- 화주가 보완 회신을 남긴 순간 배정 포워더에게 알린다.
  if new.forwarder_user_id is not null
    and v_new_request #>> '{shipperReplyAt}' is not null
    and v_new_request #>> '{shipperReplyAt}' is distinct from v_old_request #>> '{shipperReplyAt}'
  then
    select company_name into v_company from public.user_profiles where id = new.user_id;
    v_payload := jsonb_build_object(
      'shipper_company', coalesce(v_company, ''),
      'item_name', v_item_name,
      'bl_no', v_bl_no
    );
    insert into public.notifications (recipient_user_id, type, trade_id, payload)
    values (new.forwarder_user_id, 'trade_return_replied', new.id, v_payload);
  end if;

  -- 배정 포워더가 서류 업무를 완료하면 화주에게 알린다.
  if new.forwarder_user_id is not null
    and v_new_stage = 'done'
    and v_new_stage is distinct from v_old_stage
  then
    select company_name into v_company from public.user_profiles where id = new.forwarder_user_id;
    v_payload := jsonb_build_object(
      'forwarder_company', coalesce(v_company, ''),
      'item_name', v_item_name,
      'bl_no', v_bl_no
    );
    insert into public.notifications (recipient_user_id, type, trade_id, payload)
    values (new.user_id, 'trade_forwarder_completed', new.id, v_payload);
  end if;

  return new;
end;
$$;

drop trigger if exists trades_notify_workflow_event on public.trades;
create trigger trades_notify_workflow_event
  after update of workflow_data on public.trades
  for each row execute function public.notify_trade_workflow_event();

revoke all on function public.notify_trade_workflow_event() from public, anon, authenticated;

-- 실시간 구독을 켜되 이미 publication에 포함된 환경에서도 재실행 가능하게 한다.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    )
  then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

commit;
