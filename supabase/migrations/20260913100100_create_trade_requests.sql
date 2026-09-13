-- Internal (member-to-member) shipper -> forwarder trade handoff requests.
-- Independent of trades.status: a trade_requests row never changes the
-- meaning of generated/in_progress/submitted/failed on public.trades.

begin;

create table public.trade_requests (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  receiver_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  constraint trade_requests_status_check
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  constraint trade_requests_requester_receiver_diff
    check (requester_user_id <> receiver_user_id)
);

comment on table public.trade_requests is
  'Shipper-initiated requests asking a registered forwarder account to take over a trade. Status is independent of trades.status.';

-- Prevent duplicate pending requests for the same (trade, requester, receiver).
create unique index trade_requests_unique_pending_idx
  on public.trade_requests (trade_id, requester_user_id, receiver_user_id)
  where status = 'pending';

create index trade_requests_receiver_status_idx
  on public.trade_requests (receiver_user_id, status, created_at desc);
create index trade_requests_requester_idx
  on public.trade_requests (requester_user_id, created_at desc);
create index trade_requests_trade_id_idx
  on public.trade_requests (trade_id);

alter table public.trade_requests enable row level security;

create policy trade_requests_select_participant
  on public.trade_requests
  for select
  to authenticated
  using ((select auth.uid()) = requester_user_id or (select auth.uid()) = receiver_user_id);

create policy trade_requests_insert_requester
  on public.trade_requests
  for insert
  to authenticated
  with check (
    (select auth.uid()) = requester_user_id
    and exists (
      select 1 from public.trades t
      where t.id = trade_id and t.user_id = (select auth.uid())
    )
  );

create policy trade_requests_update_requester_cancel
  on public.trade_requests
  for update
  to authenticated
  using ((select auth.uid()) = requester_user_id and status = 'pending')
  with check ((select auth.uid()) = requester_user_id and status = 'cancelled');

create policy trade_requests_update_receiver_reject
  on public.trade_requests
  for update
  to authenticated
  using ((select auth.uid()) = receiver_user_id and status = 'pending')
  with check ((select auth.uid()) = receiver_user_id and status = 'rejected');

-- `with check` only validates the shape of the new row, not which columns
-- changed, so a client could otherwise smuggle a trade_id/receiver change
-- alongside a legitimate status flip. Lock every non-status column.
create or replace function public.enforce_trade_requests_update_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.trade_id is distinct from old.trade_id
    or new.requester_user_id is distinct from old.requester_user_id
    or new.receiver_user_id is distinct from old.receiver_user_id
    or new.message is distinct from old.message
    or new.created_at is distinct from old.created_at
  then
    raise exception 'trade_requests: only status and status timestamps may change';
  end if;
  return new;
end;
$$;

create trigger trade_requests_enforce_update_scope
  before update on public.trade_requests
  for each row execute function public.enforce_trade_requests_update_scope();

create trigger set_trade_requests_updated_at
  before update on public.trade_requests
  for each row execute function public.set_updated_at();

-- Atomically: verify the caller is the receiver of a pending request, assign
-- the trade to them, mark the request accepted, and auto-cancel any other
-- pending requests for the same trade (trades.forwarder_user_id is a single
-- column, so a trade can only end up assigned to one forwarder).
--
-- This must be security definer: accepting has to set
-- public.trades.forwarder_user_id on a row the accepting forwarder does not
-- own, which trades_update_assigned_forwarder alone cannot allow (it requires
-- forwarder_user_id to already equal the caller). The function re-validates
-- the caller's identity and the request's pending status itself rather than
-- trusting any client-supplied claim.
create or replace function public.accept_trade_request(p_request_id uuid)
returns public.trade_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.trade_requests;
  v_trade public.trades;
begin
  select * into v_request from public.trade_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'request_not_found';
  end if;
  if v_request.receiver_user_id <> auth.uid() then
    raise exception 'not_authorized';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;

  select * into v_trade from public.trades where id = v_request.trade_id for update;
  if v_trade.id is null then
    raise exception 'trade_not_found';
  end if;
  if v_trade.forwarder_user_id is not null then
    raise exception 'trade_already_assigned';
  end if;

  update public.trades set forwarder_user_id = auth.uid() where id = v_trade.id;

  update public.trade_requests
    set status = 'accepted', accepted_at = now()
    where id = p_request_id;

  update public.trade_requests
    set status = 'cancelled', cancelled_at = now()
    where trade_id = v_request.trade_id
      and id <> p_request_id
      and status = 'pending';

  select * into v_request from public.trade_requests where id = p_request_id;
  return v_request;
end;
$$;

revoke all on function public.accept_trade_request(uuid) from public, anon;
grant execute on function public.accept_trade_request(uuid) to authenticated;

revoke all on table public.trade_requests from anon, authenticated;
grant select, insert, update on table public.trade_requests to authenticated;
grant all on table public.trade_requests to service_role;
revoke all on function public.enforce_trade_requests_update_scope() from public, anon, authenticated;

commit;
