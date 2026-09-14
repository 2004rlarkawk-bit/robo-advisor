-- In-app notifications for trade_requests events, plus two narrow
-- security-definer lookup RPCs needed by the forwarder request feature:
--  - find_forwarder_by_email: lets a shipper search for a registered
--    forwarder account without ever selecting from user_profiles/auth.users
--    directly (RLS on user_profiles restricts select to the row owner only).
--  - get_trade_request_preview: lets a forwarder see the minimal trade
--    preview fields required to decide accept/reject, before
--    trades.forwarder_user_id is set (i.e. before normal trades RLS would
--    otherwise let them see anything about the trade).

begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  trade_request_id uuid references public.trade_requests(id) on delete cascade,
  trade_id uuid references public.trades(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check
    check (type in ('trade_request_received', 'trade_request_accepted', 'trade_request_rejected'))
);

create index notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, read_at, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using ((select auth.uid()) = recipient_user_id);

create policy notifications_update_own_mark_read
  on public.notifications
  for update
  to authenticated
  using ((select auth.uid()) = recipient_user_id)
  with check ((select auth.uid()) = recipient_user_id);

create or replace function public.enforce_notifications_update_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.recipient_user_id is distinct from old.recipient_user_id
    or new.type is distinct from old.type
    or new.trade_request_id is distinct from old.trade_request_id
    or new.trade_id is distinct from old.trade_id
    or new.payload is distinct from old.payload
    or new.created_at is distinct from old.created_at
  then
    raise exception 'notifications: clients may only set read_at';
  end if;
  return new;
end;
$$;

create trigger notifications_enforce_update_scope
  before update on public.notifications
  for each row execute function public.enforce_notifications_update_scope();

-- Clients never insert notifications directly (that would let a client forge
-- events for other users). A security-definer trigger on trade_requests
-- creates them instead.
create or replace function public.notify_trade_request_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_user_id, type, trade_request_id, trade_id, payload)
    values (new.receiver_user_id, 'trade_request_received', new.id, new.trade_id,
      jsonb_build_object('requester_user_id', new.requester_user_id));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'accepted' then
      insert into public.notifications (recipient_user_id, type, trade_request_id, trade_id, payload)
      values (new.requester_user_id, 'trade_request_accepted', new.id, new.trade_id, '{}'::jsonb);
    elsif new.status = 'rejected' then
      insert into public.notifications (recipient_user_id, type, trade_request_id, trade_id, payload)
      values (new.requester_user_id, 'trade_request_rejected', new.id, new.trade_id, '{}'::jsonb);
    end if;
  end if;
  return new;
end;
$$;

create trigger trade_requests_notify
  after insert or update on public.trade_requests
  for each row execute function public.notify_trade_request_event();

revoke all on table public.notifications from anon, authenticated;
grant select, update on table public.notifications to authenticated;
grant all on table public.notifications to service_role;
revoke all on function public.enforce_notifications_update_scope() from public, anon, authenticated;
revoke all on function public.notify_trade_request_event() from public, anon, authenticated;

-- Forwarder search by email — narrow fields only, forwarder/integrated only.
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
    and up.id <> auth.uid()
  limit 1;
$$;

revoke all on function public.find_forwarder_by_email(text) from public, anon;
grant execute on function public.find_forwarder_by_email(text) to authenticated;

-- Narrow preview for the forwarder before accepting: only these fields (per
-- spec), never the full trades row, regardless of forwarder_user_id state.
create or replace function public.get_trade_request_preview(p_request_id uuid)
returns table (
  request_id uuid,
  status text,
  message text,
  created_at timestamptz,
  requester_company text,
  requester_contact text,
  direction text,
  load_port text,
  discharge_port text,
  item_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    tr.id,
    tr.status,
    tr.message,
    tr.created_at,
    up.company_name,
    up.contact_name,
    t.direction,
    t.form_data #>> '{shipment,loadPort}',
    t.form_data #>> '{shipment,dischargePort}',
    t.form_data #>> '{items,0,description}'
  from public.trade_requests tr
  join public.trades t on t.id = tr.trade_id
  join public.user_profiles up on up.id = tr.requester_user_id
  where tr.id = p_request_id
    and tr.receiver_user_id = auth.uid();
$$;

revoke all on function public.get_trade_request_preview(uuid) from public, anon;
grant execute on function public.get_trade_request_preview(uuid) to authenticated;

commit;
