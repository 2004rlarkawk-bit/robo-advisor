-- Send history for shipper -> non-member forwarder email requests. This is a
-- distinct concept from trade_requests: external forwarders never join the
-- service, so there is no accepted/rejected/joined status here, only
-- pending/sent/failed describing the email send outcome itself.

begin;

create table public.external_forwarder_requests (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  recipient_company text,
  recipient_name text,
  message text,
  sent_document_types text[] not null default '{}',
  status text not null default 'pending',
  sent_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_forwarder_requests_status_check
    check (status in ('pending', 'sent', 'failed'))
);

comment on table public.external_forwarder_requests is
  'Send history for emailing generated trade documents to a non-member forwarder. Written only by the send-forwarder-request-email Edge Function (service role).';

create index external_forwarder_requests_requester_idx
  on public.external_forwarder_requests (requester_user_id, created_at desc);
create index external_forwarder_requests_trade_id_idx
  on public.external_forwarder_requests (trade_id);

alter table public.external_forwarder_requests enable row level security;

create policy external_forwarder_requests_select_own
  on public.external_forwarder_requests
  for select
  to authenticated
  using ((select auth.uid()) = requester_user_id);

create trigger set_external_forwarder_requests_updated_at
  before update on public.external_forwarder_requests
  for each row execute function public.set_updated_at();

-- Deliberately no insert/update grant to authenticated: only the
-- send-forwarder-request-email Edge Function (service role) writes this
-- table, since only it knows the true, server-verified send outcome. This
-- also makes it impossible for a client to forge a fake send-history row.
revoke all on table public.external_forwarder_requests from anon, authenticated;
grant select on table public.external_forwarder_requests to authenticated;
grant all on table public.external_forwarder_requests to service_role;

commit;
