-- 수출 선적 완료도 화주 벨 알림으로 연결한다.
-- sync_export_forwarder_case_to_source가 포워더의 수출 진행 상태를 화주 원본
-- 거래(workflow_data.exportForwarderCase)로 미러링하므로, 그 갱신 순간
-- (completedAt이 새로 기록될 때) 화주에게 trade_forwarder_completed를 보낸다.
-- role='shipper' 행에서만 발송해 포워더 자신의 사본 행 갱신으로는 울리지 않는다.
-- 기존 수입(forwarderCase) 분기는 20260915190000 버전 그대로 유지한다.

begin;

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
  v_old_export_done text := old.workflow_data #>> '{exportForwarderCase,completedAt}';
  v_new_export_done text := new.workflow_data #>> '{exportForwarderCase,completedAt}';
  v_company text;
  v_payload jsonb;
  v_forwarder_recipient uuid := coalesce(new.forwarder_user_id, new.user_id);
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
    select company_name into v_company from public.user_profiles where id = v_forwarder_recipient;
    v_payload := jsonb_build_object(
      'forwarder_company', coalesce(v_company, ''),
      'item_name', v_item_name,
      'bl_no', v_bl_no
    );
    insert into public.notifications (recipient_user_id, type, trade_id, payload)
    values (new.user_id, 'trade_return_requested', new.id, v_payload);
  end if;

  -- 화주가 보완 회신을 남긴 순간 포워더(지정이 없으면 거래 소유자)에게 알린다.
  if v_new_request #>> '{shipperReplyAt}' is not null
    and v_new_request #>> '{shipperReplyAt}' is distinct from v_old_request #>> '{shipperReplyAt}'
  then
    select company_name into v_company from public.user_profiles where id = new.user_id;
    v_payload := jsonb_build_object(
      'shipper_company', coalesce(v_company, ''),
      'item_name', v_item_name,
      'bl_no', v_bl_no
    );
    insert into public.notifications (recipient_user_id, type, trade_id, payload)
    values (v_forwarder_recipient, 'trade_return_replied', new.id, v_payload);
  end if;

  -- 수입: 포워더가 서류 업무를 완료하면 화주에게 알린다.
  if v_new_stage = 'done'
    and v_new_stage is distinct from v_old_stage
  then
    select company_name into v_company from public.user_profiles where id = v_forwarder_recipient;
    v_payload := jsonb_build_object(
      'forwarder_company', coalesce(v_company, ''),
      'item_name', v_item_name,
      'bl_no', v_bl_no
    );
    insert into public.notifications (recipient_user_id, type, trade_id, payload)
    values (new.user_id, 'trade_forwarder_completed', new.id, v_payload);
  end if;

  -- 수출: 선적 완료가 화주 원본 거래로 미러링되는 순간 화주에게 알린다.
  if new.direction = 'export' and new.role = 'shipper'
    and v_new_export_done is not null
    and v_new_export_done is distinct from v_old_export_done
  then
    select company_name into v_company from public.user_profiles where id = v_forwarder_recipient;
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

revoke all on function public.notify_trade_workflow_event() from public, anon, authenticated;

commit;
