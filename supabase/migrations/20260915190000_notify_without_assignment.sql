-- 겸용(한 계정) 시연 보완: 회신·완료 알림이 지정 포워더(forwarder_user_id)가
-- 없으면 아예 발송되지 않던 것을, 지정이 없을 때는 거래 소유자에게 보내도록
-- 완화한다. (겸용 계정은 화주·포워더가 같은 사람이므로 역할 필터가
-- 알림을 올바른 화면에만 보여준다.) 지정 포워더가 있으면 기존과 동일.

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

  -- 포워더가 서류 업무를 완료하면 화주에게 알린다.
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

  return new;
end;
$$;

revoke all on function public.notify_trade_workflow_event() from public, anon, authenticated;

commit;
