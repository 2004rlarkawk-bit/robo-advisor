-- Adds a nullable forwarder assignment column to public.trades so a trade can
-- be handed off from its shipper owner to a different (forwarder) account
-- once a trade_requests row is accepted. Does not change the meaning of
-- trades.status, trades.role, or any existing column.
--
-- Visibility: fetchSavedTrades()/fetchTradeManagerTrades()/fetchSubmittedTrades()
-- (src/services/storageService.ts) issue plain `select('*')` with no explicit
-- user filter and rely entirely on RLS. Adding trades_select_assigned_forwarder
-- below is therefore sufficient for the existing forwarder-inbox derivation
-- logic (forwarderExportRequestService.ts, forwarderCaseService.ts) to start
-- returning genuinely cross-account assigned trades with no application code
-- changes to those query functions.

begin;

alter table public.trades
  add column forwarder_user_id uuid references auth.users(id) on delete set null;

create index trades_forwarder_user_id_idx
  on public.trades (forwarder_user_id)
  where forwarder_user_id is not null;

create policy trades_select_assigned_forwarder
  on public.trades
  for select
  to authenticated
  using ((select auth.uid()) = forwarder_user_id);

create policy trades_update_assigned_forwarder
  on public.trades
  for update
  to authenticated
  using ((select auth.uid()) = forwarder_user_id)
  with check ((select auth.uid()) = forwarder_user_id);

-- RLS `with check` alone cannot compare OLD vs NEW column values, so it cannot
-- stop an assigned forwarder from rewriting the shipper's form_data or
-- reassigning the trade to themselves/someone else. This trigger locks every
-- column except workflow_data/updated_at whenever the actor updating the row
-- is the assigned forwarder rather than the owning shipper.
create or replace function public.enforce_trades_forwarder_update_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() = old.forwarder_user_id and auth.uid() is distinct from old.user_id then
    if new.user_id is distinct from old.user_id
      or new.forwarder_user_id is distinct from old.forwarder_user_id
      or new.direction is distinct from old.direction
      or new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.form_data is distinct from old.form_data
      or new.document_data is distinct from old.document_data
      or new.documents is distinct from old.documents
      or new.issues is distinct from old.issues
      or new.schema_version is distinct from old.schema_version
      or new.source_trade_id is distinct from old.source_trade_id
      or new.generated_at is distinct from old.generated_at
      or new.submitted_at is distinct from old.submitted_at
      or new.flow_completed_at is distinct from old.flow_completed_at
      or new.created_at is distinct from old.created_at
    then
      raise exception 'forwarder may only update workflow_data on an assigned trade';
    end if;
  end if;
  return new;
end;
$$;

create trigger trades_enforce_forwarder_update_scope
  before update on public.trades
  for each row execute function public.enforce_trades_forwarder_update_scope();

revoke all on function public.enforce_trades_forwarder_update_scope() from public, anon, authenticated;

commit;
