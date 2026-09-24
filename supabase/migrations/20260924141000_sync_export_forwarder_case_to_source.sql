-- A forwarder export trade is a separate row from the shipper's original
-- request. Mirror the forwarder's workflow status atomically so the shipper's
-- request badge reflects the same progress. The source trade remains owned by
-- the shipper and its document/form/status columns are never changed here.
begin;

create or replace function public.sync_export_forwarder_case_to_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.trades%rowtype;
  v_case jsonb;
begin
  v_case := new.workflow_data -> 'exportForwarderCase';
  if new.direction <> 'export' or new.role <> 'forwarder'
    or new.source_trade_id is null or v_case is null
    or v_case is not distinct from (old.workflow_data -> 'exportForwarderCase') then
    return new;
  end if;

  select * into v_source from public.trades where id = new.source_trade_id for update;
  if not found or v_source.direction <> 'export' or v_source.role <> 'shipper'
    or (v_source.user_id is distinct from new.user_id
      and v_source.forwarder_user_id is distinct from new.user_id) then
    raise exception 'invalid export forwarder source trade';
  end if;

  update public.trades
    set workflow_data = jsonb_set(coalesce(workflow_data, '{}'::jsonb), '{exportForwarderCase}', v_case, true)
    where id = v_source.id;
  return new;
end;
$$;

create trigger trades_sync_export_forwarder_case_to_source
  after update of workflow_data on public.trades
  for each row execute function public.sync_export_forwarder_case_to_source();

revoke all on function public.sync_export_forwarder_case_to_source() from public, anon, authenticated;

commit;
