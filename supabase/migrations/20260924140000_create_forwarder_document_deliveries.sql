-- Forwarder -> shipper / overseas partner document delivery is not a shipper
-- request for forwarding. Keep its send history separate from requests.
begin;

create table public.forwarder_document_deliveries (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  delivery_kind text not null check (delivery_kind in ('shipment_notice', 'shipping_advice')),
  recipient_email text not null,
  recipient_company text,
  recipient_name text,
  message text,
  sent_document_types text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index forwarder_document_deliveries_sender_idx
  on public.forwarder_document_deliveries (sender_user_id, created_at desc);
create index forwarder_document_deliveries_trade_idx
  on public.forwarder_document_deliveries (trade_id, created_at desc);

alter table public.forwarder_document_deliveries enable row level security;
create policy forwarder_document_deliveries_select_own
  on public.forwarder_document_deliveries for select to authenticated
  using ((select auth.uid()) = sender_user_id);

create trigger set_forwarder_document_deliveries_updated_at
  before update on public.forwarder_document_deliveries
  for each row execute function public.set_updated_at();

-- Only the verified send Edge Function writes outcome rows.
revoke all on table public.forwarder_document_deliveries from anon, authenticated;
grant select on table public.forwarder_document_deliveries to authenticated;
grant all on table public.forwarder_document_deliveries to service_role;

commit;
