-- 의뢰별 대화 스레드.
--
-- 지금까지 화주↔포워더 소통은 trade_requests.message 한 줄과
-- trades.workflow_data.forwarderCase.returnRequest 한 칸(보완 요청 1건 + 회신 1건)뿐이라
-- 2차 보완 요청이 오면 이전 내용이 덮어써졌다. 주고받은 내용이 쌓이도록 별도 테이블을 둔다.
--
-- 스레드는 거래(trade)가 아니라 의뢰(trade_request) 단위다. 한 거래를 포워더 여러 명에게
-- 의뢰하면 방이 포워더별로 나뉘고, 포워더 A는 B와의 대화를 볼 수 없다.
-- 기존 returnRequest 구조는 단계 전환·배지·알림을 물고 있어 그대로 두고,
-- 화면에서만 이 스레드와 시간순으로 합쳐 보여준다.

begin;

create table public.trade_messages (
  id uuid primary key default gen_random_uuid(),
  trade_request_id uuid not null references public.trade_requests(id) on delete cascade,
  -- 조회 편의용. 클라이언트가 보내는 값은 무시하고 트리거가 의뢰에서 채운다.
  trade_id uuid not null references public.trades(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  -- message: 일반 대화 / return_request: 보완 요청 / return_reply: 보완 회신
  kind text not null default 'message',
  body text not null,
  created_at timestamptz not null default now(),
  -- 받는 쪽이 읽은 시각. 보낸 쪽은 바꿀 수 없다.
  read_at timestamptz,
  constraint trade_messages_kind_check
    check (kind in ('message', 'return_request', 'return_reply')),
  constraint trade_messages_body_check
    check (char_length(btrim(body)) between 1 and 4000)
);

comment on table public.trade_messages is
  'Per-request conversation between a shipper and one forwarder. One thread per trade_requests row.';

create index trade_messages_request_created_idx
  on public.trade_messages (trade_request_id, created_at);
create index trade_messages_trade_idx
  on public.trade_messages (trade_id, created_at desc);
create index trade_messages_unread_idx
  on public.trade_messages (trade_request_id, read_at)
  where read_at is null;

alter table public.trade_messages enable row level security;

-- 참여자 = 그 의뢰의 보낸이(화주) 또는 받는이(포워더).
create or replace function public.is_trade_request_participant(p_request_id uuid)
returns boolean
language sql
security invoker
stable
set search_path = public
as $$
  select exists (
    select 1 from public.trade_requests r
    where r.id = p_request_id
      and (r.requester_user_id = (select auth.uid()) or r.receiver_user_id = (select auth.uid()))
  );
$$;

create policy trade_messages_select_participant
  on public.trade_messages
  for select
  to authenticated
  using (public.is_trade_request_participant(trade_request_id));

-- 거절·취소된 의뢰의 스레드에는 더 쓸 수 없다.
create policy trade_messages_insert_participant
  on public.trade_messages
  for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_user_id
    and exists (
      select 1 from public.trade_requests r
      where r.id = trade_request_id
        and r.status in ('pending', 'accepted')
        and (r.requester_user_id = (select auth.uid()) or r.receiver_user_id = (select auth.uid()))
    )
  );

-- 받는 쪽만 read_at을 바꿀 수 있다.
create policy trade_messages_update_recipient_read
  on public.trade_messages
  for update
  to authenticated
  using (
    (select auth.uid()) <> sender_user_id
    and public.is_trade_request_participant(trade_request_id)
  )
  with check (
    (select auth.uid()) <> sender_user_id
    and public.is_trade_request_participant(trade_request_id)
  );

-- trade_id는 클라이언트 값을 믿지 않고 의뢰에서 채운다.
create or replace function public.fill_trade_message_trade_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select r.trade_id into new.trade_id from public.trade_requests r where r.id = new.trade_request_id;
  if new.trade_id is null then
    raise exception 'trade_messages: unknown trade_request_id';
  end if;
  return new;
end;
$$;

create trigger trade_messages_fill_trade_id
  before insert on public.trade_messages
  for each row execute function public.fill_trade_message_trade_id();

-- update는 read_at만 허용한다 (notifications와 같은 방식).
create or replace function public.enforce_trade_messages_update_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.trade_request_id is distinct from old.trade_request_id
    or new.trade_id is distinct from old.trade_id
    or new.sender_user_id is distinct from old.sender_user_id
    or new.kind is distinct from old.kind
    or new.body is distinct from old.body
    or new.created_at is distinct from old.created_at
  then
    raise exception 'trade_messages: clients may only set read_at';
  end if;
  return new;
end;
$$;

create trigger trade_messages_enforce_update_scope
  before update on public.trade_messages
  for each row execute function public.enforce_trade_messages_update_scope();

-- 새 메시지 → 상대 참여자에게 알림. notifications는 클라이언트가 직접 insert할 수 없어
-- security definer 트리거로 만든다.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'trade_request_received',
    'trade_request_accepted',
    'trade_request_rejected',
    'trade_return_requested',
    'trade_return_replied',
    'trade_forwarder_completed',
    'trade_message_received'
  ));

create or replace function public.notify_trade_message_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.trade_requests;
  v_recipient uuid;
  v_company text;
  v_contact text;
  v_item_name text;
begin
  select * into v_request from public.trade_requests where id = new.trade_request_id;
  if v_request.id is null then
    return new;
  end if;

  v_recipient := case
    when new.sender_user_id = v_request.requester_user_id then v_request.receiver_user_id
    else v_request.requester_user_id
  end;

  select company_name, contact_name into v_company, v_contact
    from public.user_profiles where id = new.sender_user_id;
  select coalesce(t.form_data #>> '{items,0,description}', '') into v_item_name
    from public.trades t where t.id = new.trade_id;

  insert into public.notifications (recipient_user_id, type, trade_request_id, trade_id, payload)
  values (
    v_recipient,
    'trade_message_received',
    new.trade_request_id,
    new.trade_id,
    jsonb_build_object(
      'message_id', new.id,
      'kind', new.kind,
      'sender_company', coalesce(v_company, ''),
      'sender_contact', coalesce(v_contact, ''),
      'item_name', v_item_name,
      'preview', left(btrim(new.body), 80)
    )
  );
  return new;
end;
$$;

create trigger trade_messages_notify
  after insert on public.trade_messages
  for each row execute function public.notify_trade_message_event();

revoke all on table public.trade_messages from anon, authenticated;
grant select, insert, update on table public.trade_messages to authenticated;
grant all on table public.trade_messages to service_role;
revoke all on function public.is_trade_request_participant(uuid) from public, anon;
grant execute on function public.is_trade_request_participant(uuid) to authenticated;
revoke all on function public.fill_trade_message_trade_id() from public, anon, authenticated;
revoke all on function public.enforce_trade_messages_update_scope() from public, anon, authenticated;
revoke all on function public.notify_trade_message_event() from public, anon, authenticated;

-- 스레드 화면이 새 메시지를 바로 받도록 실시간 구독을 켠다. 재실행해도 안전하다.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'trade_messages'
    )
  then
    alter publication supabase_realtime add table public.trade_messages;
  end if;
end;
$$;

commit;
