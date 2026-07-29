-- Deployment prerequisite for TradeFormData v3 attachments.
-- REVIEW AND RUN SEPARATELY BEFORE THE APPLICATION/MIGRATION CUTOVER.
-- This file is intentionally outside supabase/migrations and is not applied by
-- `supabase db push`.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  allowed_mime_types
)
values (
  'trade-documents',
  'trade-documents',
  false,
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do nothing;

create policy trade_documents_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'trade-documents'
    and split_part(name, '/', 1) = (select auth.uid()::text)
  );

create policy trade_documents_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'trade-documents'
    and split_part(name, '/', 1) = (select auth.uid()::text)
  );

create policy trade_documents_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'trade-documents'
    and split_part(name, '/', 1) = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'trade-documents'
    and split_part(name, '/', 1) = (select auth.uid()::text)
  );

create policy trade_documents_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'trade-documents'
    and split_part(name, '/', 1) = (select auth.uid()::text)
  );

commit;

-- Post-run checks:
-- 1. storage.buckets.id = 'trade-documents' and public = false.
-- 2. Exactly four trade_documents_*_own policies exist on storage.objects.
-- 3. An authenticated user can access only names whose first segment is their
--    auth.uid(); anon and a different authenticated user are denied.
