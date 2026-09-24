-- Existing conversation, including integrated accounts occupying both request roles.
begin;

alter table public.trade_messages add column if not exists sender_role text
  check (sender_role in ('shipper', 'forwarder'));

-- Historical self-request messages have no reliable role: leave them unchanged.
-- Temporarily remove the immutability trigger for this controlled backfill.
drop trigger if exists trade_messages_enforce_update_scope on public.trade_messages;
update public.trade_messages m
set sender_role = case when m.sender_user_id = r.requester_user_id then 'shipper' else 'forwarder' end
from public.trade_requests r
where r.id = m.trade_request_id and r.requester_user_id <> r.receiver_user_id
  and m.sender_role is null;

create or replace function public.enforce_trade_messages_update_scope()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'trade_messages: clients may only set read_at';
  end if;
  return new;
end;
$$;
create trigger trade_messages_enforce_update_scope before update on public.trade_messages
for each row execute function public.enforce_trade_messages_update_scope();

create or replace function public.fill_trade_message_trade_id()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.trade_requests;
begin
  select * into r from public.trade_requests where id = new.trade_request_id;
  if r.id is null then raise exception 'Unknown request'; end if;
  new.trade_id := r.trade_id;
  if new.sender_role is null and r.requester_user_id <> r.receiver_user_id then
    new.sender_role := case when new.sender_user_id = r.requester_user_id then 'shipper' else 'forwarder' end;
  end if;
  if new.sender_role is null
    or (new.sender_role = 'shipper' and new.sender_user_id <> r.requester_user_id)
    or (new.sender_role = 'forwarder' and new.sender_user_id <> r.receiver_user_id)
    or (r.requester_user_id = r.receiver_user_id and not exists (
      select 1 from public.user_profiles p where p.id = new.sender_user_id
        and coalesce(p.service_role, 'integrated') = 'integrated'
    )) then
    raise exception 'Invalid sender role' using errcode = '42501';
  end if;
  new.read_at := null;
  return new;
end;
$$;

drop policy if exists trade_messages_update_recipient_read on public.trade_messages;
create policy trade_messages_update_recipient_read on public.trade_messages
for update to authenticated
using (exists (
  select 1 from public.trade_requests r where r.id = trade_request_id and (
    (sender_role = 'shipper' and r.receiver_user_id = (select auth.uid()))
    or (sender_role = 'forwarder' and r.requester_user_id = (select auth.uid()))
    or (sender_role is null and sender_user_id <> (select auth.uid())
      and (r.requester_user_id = (select auth.uid()) or r.receiver_user_id = (select auth.uid())))
  )
))
with check (public.is_trade_request_participant(trade_request_id));

create or replace function public.notify_trade_message_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.trade_requests;
  v_company text;
  v_contact text;
  v_item_name text;
begin
  select * into r from public.trade_requests where id = new.trade_request_id;
  select company_name, contact_name into v_company, v_contact
    from public.user_profiles where id = new.sender_user_id;
  select coalesce(t.form_data #>> '{items,0,description}', '') into v_item_name
    from public.trades t where t.id = new.trade_id;
  insert into public.notifications (recipient_user_id, type, trade_request_id, trade_id, payload)
  values (
    case when new.sender_role = 'shipper' then r.receiver_user_id else r.requester_user_id end,
    'trade_message_received', new.trade_request_id, new.trade_id,
    jsonb_build_object(
      'message_id', new.id, 'kind', new.kind,
      'sender_role', new.sender_role,
      'recipient_role', case when new.sender_role = 'shipper' then 'forwarder' else 'shipper' end,
      'sender_company', coalesce(v_company, ''), 'sender_contact', coalesce(v_contact, ''),
      'item_name', v_item_name, 'preview', left(btrim(new.body), 80)
    )
  );
  return new;
end;
$$;
commit;
