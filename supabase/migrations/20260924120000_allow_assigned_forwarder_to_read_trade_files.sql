-- 배정된 포워더가 화주 업로드 원본 파일을 열람할 수 있게 한다.
--
-- 지금은 거래 공유 권한과 첨부파일 권한이 어긋나 있다. 포워더가 요청을 수락해
-- trades.forwarder_user_id에 배정되면 거래 행과 생성 문서는 읽히지만(trades_select_assigned_forwarder),
-- 화주가 올린 원본 파일은 trade-documents 버킷 정책이 "경로 첫 칸 = auth.uid()"만 허용해 막힌다.
--
-- 허용 대상은 둘뿐이다: 파일을 올린 화주 본인(기존 정책 유지), 그 거래에 배정된 포워더.
-- forwarder 역할이라는 이유만으로는 아무 파일도 열리지 않는다 — 반드시 그 거래의 배정자여야 한다.
-- 배정이 바뀌거나 해제되면 조건이 즉시 거짓이 되어 접근도 같이 사라진다.
--
-- 경로는 <화주 uid>/<scopeId>/<문서종류>/<파일명> 이고 scopeId는 보통 거래 id다.
-- 거래 저장 전에 올린 파일은 scopeId가 'draft…'라 경로만으로 거래를 찾을 수 없어,
-- 그 경우에만 거래 form_data.attachments에 실제로 실린 파일인지로 확인한다.
-- 두 경로 모두 "경로 첫 칸 = 그 거래 화주의 uid"를 함께 요구해 다른 사용자 파일로 새지 않게 한다.
-- 재실행해도 안전하다.

begin;

drop policy if exists trade_documents_select_assigned_forwarder on storage.objects;

create policy trade_documents_select_assigned_forwarder
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'trade-documents'
    and exists (
      select 1
      from public.trades t
      where t.forwarder_user_id = (select auth.uid())
        and t.user_id::text = split_part(objects.name, '/', 1)
        and (
          -- 거래 저장 후 올린 파일: 경로 두 번째 칸이 그 거래 id다.
          t.id::text = split_part(objects.name, '/', 2)
          -- 거래 저장 전(draft) 올린 파일: 그 거래에 첨부로 실려 있는지 확인한다.
          or (
            split_part(objects.name, '/', 2) like 'draft%'
            and exists (
              select 1
              from jsonb_array_elements(
                case
                  when jsonb_typeof(t.form_data -> 'attachments') = 'array'
                    then t.form_data -> 'attachments'
                  else '[]'::jsonb
                end
              ) as a
              where a ->> 'storagePath' = objects.name
            )
          )
        )
    )
  );

comment on policy trade_documents_select_assigned_forwarder on storage.objects is
  'Assigned forwarder (trades.forwarder_user_id) may read that trade''s shipper-uploaded files. Owner access stays in trade_documents_select_own.';

commit;
