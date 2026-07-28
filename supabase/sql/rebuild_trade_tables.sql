/*
 * 주의: 이 SQL은 기존 trades 및 거래 초안 데이터를 삭제합니다.
 * 실행 전 반드시 데이터 백업 또는 CSV 내보내기를 진행하세요.
 *
 * 이 파일은 개발 단계의 거래 스키마 재구성용입니다.
 * Supabase SQL Editor에서 내용을 검토한 뒤 사용자가 직접 실행해야 합니다.
 * auth.users, storage.objects 및 다른 업무 테이블은 삭제하지 않습니다.
 */

begin;

-- 코드 검색 결과 실제 초안 테이블명은 public.trade_drafts입니다.
-- 저장소 안에는 이 두 테이블을 참조하는 별도 FK/뷰가 없으므로 CASCADE를 사용하지 않습니다.
drop table if exists public.trade_drafts;
drop table if exists public.trades;
drop function if exists public.set_trade_drafts_updated_at();
drop function if exists public.set_trades_updated_at();

-- 두 테이블이 공유하는 updated_at 트리거 함수입니다.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_direction text not null,
  trade_role text not null,
  status text not null default 'draft',

  -- 거래 입력 및 사용자 최종 수정값
  profile jsonb not null default '{}'::jsonb,
  -- 일반 업로드/생성 문서의 메타데이터 목록. 브라우저 File 객체는 저장하지 않습니다.
  documents jsonb not null default '[]'::jsonb,
  -- 수입 포워더 도착통지서의 단일 메타데이터. null 여부가 첨부 여부의 단일 원본입니다.
  arrival_notice jsonb,
  generated_docs jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  analysis_result jsonb not null default '{}'::jsonb,
  risk_summary jsonb not null default '[]'::jsonb,
  customs_progress jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  generated_at timestamptz,
  submitted_at timestamptz,
  -- UI의 완료 버튼을 처음 누른 시각입니다. in_progress에서도 기록하며 최종 제출 때 덮어쓰지 않습니다.
  flow_completed_at timestamptz,

  constraint trades_trade_direction_check
    check (trade_direction in ('export', 'import')),
  constraint trades_trade_role_check
    check (trade_role in ('shipper', 'forwarder')),
  constraint trades_status_check
    check (
      status in (
        'draft',
        'generating',
        'generated',
        'submitting',
        'in_progress',
        'submitted',
        'failed'
      )
    ),
  constraint trades_in_progress_scope_check
    check (
      status <> 'in_progress'
      or (trade_direction = 'import' and trade_role = 'forwarder')
    ),
  constraint trades_json_shapes_check
    check (
      jsonb_typeof(profile) = 'object'
      and jsonb_typeof(documents) = 'array'
      and (arrival_notice is null or jsonb_typeof(arrival_notice) = 'object')
      and jsonb_typeof(generated_docs) = 'object'
      and jsonb_typeof(issues) = 'array'
      and jsonb_typeof(analysis_result) = 'object'
      and jsonb_typeof(risk_summary) in ('array', 'object')
      and jsonb_typeof(customs_progress) = 'object'
    ),
  constraint trades_arrival_notice_metadata_check
    check (
      arrival_notice is null
      or (
        arrival_notice ?& array['fileName', 'mimeType', 'size', 'uploadedAt']
        and
        jsonb_typeof(arrival_notice -> 'fileName') = 'string'
        and jsonb_typeof(arrival_notice -> 'mimeType') = 'string'
        and jsonb_typeof(arrival_notice -> 'size') = 'number'
        and (arrival_notice ->> 'size')::numeric >= 0
        and jsonb_typeof(arrival_notice -> 'uploadedAt') = 'string'
        and (
          not (arrival_notice ? 'storagePath')
          or jsonb_typeof(arrival_notice -> 'storagePath') = 'string'
        )
      )
    ),
  -- 도착통지서가 필요한 것은 "제출 완료된 수입 포워더"뿐입니다.
  -- 실제 파일 업로드 성공 여부 및 Storage 객체 존재 확인은 서비스 계층이 담당합니다.
  constraint trades_import_forwarder_submission_check
    check (
      not (
        trade_direction = 'import'
        and trade_role = 'forwarder'
        and status = 'submitted'
      )
      or arrival_notice is not null
    ),
  constraint trades_generated_timestamp_check
    check (
      status not in ('generated', 'submitting', 'in_progress', 'submitted')
      or generated_at is not null
    ),
  constraint trades_submitted_timestamp_check
    check (status <> 'submitted' or submitted_at is not null),
  constraint trades_in_progress_submitted_at_check
    check (status <> 'in_progress' or submitted_at is null)
);

create table public.trade_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_direction text not null,
  trade_role text not null,
  status text not null default 'draft',
  profile jsonb not null default '{}'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  arrival_notice jsonb,
  analysis_result jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  risk_summary jsonb not null default '[]'::jsonb,
  customs_progress jsonb not null default '{}'::jsonb,
  current_step integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trade_drafts_user_direction_role_unique
    unique (user_id, trade_direction, trade_role),
  constraint trade_drafts_trade_direction_check
    check (trade_direction in ('export', 'import')),
  constraint trade_drafts_trade_role_check
    check (trade_role in ('shipper', 'forwarder')),
  constraint trade_drafts_status_check
    check (
      status in (
        'draft',
        'generating',
        'generated',
        'submitting',
        'in_progress',
        'submitted',
        'failed'
      )
    ),
  constraint trade_drafts_in_progress_scope_check
    check (
      status <> 'in_progress'
      or (trade_direction = 'import' and trade_role = 'forwarder')
    ),
  constraint trade_drafts_current_step_check
    check (current_step between 1 and 4),
  constraint trade_drafts_json_shapes_check
    check (
      jsonb_typeof(profile) = 'object'
      and jsonb_typeof(documents) = 'array'
      and (arrival_notice is null or jsonb_typeof(arrival_notice) = 'object')
      and jsonb_typeof(analysis_result) = 'object'
      and jsonb_typeof(issues) = 'array'
      and jsonb_typeof(risk_summary) in ('array', 'object')
      and jsonb_typeof(customs_progress) = 'object'
    ),
  constraint trade_drafts_arrival_notice_metadata_check
    check (
      arrival_notice is null
      or (
        arrival_notice ?& array['fileName', 'mimeType', 'size', 'uploadedAt']
        and
        jsonb_typeof(arrival_notice -> 'fileName') = 'string'
        and jsonb_typeof(arrival_notice -> 'mimeType') = 'string'
        and jsonb_typeof(arrival_notice -> 'size') = 'number'
        and (arrival_notice ->> 'size')::numeric >= 0
        and jsonb_typeof(arrival_notice -> 'uploadedAt') = 'string'
        and (
          not (arrival_notice ? 'storagePath')
          or jsonb_typeof(arrival_notice -> 'storagePath') = 'string'
        )
      )
    )
);

-- 복합 인덱스의 첫 컬럼이 user_id이므로 별도 user_id 단독 인덱스는 중복입니다.
create index trades_user_status_created_idx
  on public.trades (user_id, status, created_at desc);
create index trades_user_direction_role_updated_idx
  on public.trades (user_id, trade_direction, trade_role, updated_at desc);
-- trade_drafts의 UNIQUE 인덱스가 사용자+방향+역할 조회를 이미 지원합니다.
create index trade_drafts_user_updated_idx
  on public.trade_drafts (user_id, updated_at desc);

create trigger set_trades_updated_at
before update on public.trades
for each row execute function public.set_updated_at();

create trigger set_trade_drafts_updated_at
before update on public.trade_drafts
for each row execute function public.set_updated_at();

alter table public.trades enable row level security;
alter table public.trade_drafts enable row level security;

create policy trades_select_own
on public.trades for select
to authenticated
using ((select auth.uid()) = user_id);

create policy trades_insert_own
on public.trades for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy trades_update_own
on public.trades for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy trades_delete_own
on public.trades for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy trade_drafts_select_own
on public.trade_drafts for select
to authenticated
using ((select auth.uid()) = user_id);

create policy trade_drafts_insert_own
on public.trade_drafts for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy trade_drafts_update_own
on public.trade_drafts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy trade_drafts_delete_own
on public.trade_drafts for delete
to authenticated
using ((select auth.uid()) = user_id);

-- anon에는 권한을 부여하지 않습니다. service_role은 서버 함수용이며 RLS를 우회할 수 있습니다.
revoke all on table public.trades from anon;
revoke all on table public.trade_drafts from anon;
grant select, insert, update, delete on table public.trades to authenticated;
grant select, insert, update, delete on table public.trade_drafts to authenticated;
grant select, insert, update, delete on table public.trades to service_role;
grant select, insert, update, delete on table public.trade_drafts to service_role;

comment on table public.trades is '수출입 거래의 최종 및 진행 상태';
comment on column public.trades.trade_direction is '거래 방향: export 또는 import';
comment on column public.trades.trade_role is '거래 역할: shipper 또는 forwarder';
comment on column public.trades.status is 'draft/generating/generated/submitting/in_progress/submitted/failed';
comment on column public.trades.profile is '거래 입력값과 사용자가 수정한 최종값';
comment on column public.trades.documents is '일반 문서 메타데이터 배열. File 객체 저장 금지';
comment on column public.trades.arrival_notice is '도착통지서 메타데이터. null이면 미첨부';
comment on column public.trades.generated_docs is '자동 생성 문서 및 미리보기 정보';
comment on column public.trades.analysis_result is 'AI 추출 및 분석 결과';
comment on column public.trades.risk_summary is '종합 리스크 분석 결과';
comment on column public.trades.customs_progress is 'UNI-PASS 통관 진행 조회 결과';
comment on column public.trades.generated_at is 'generated 상태에 최초 도달한 시각';
comment on column public.trades.submitted_at is 'submitted 상태에 최종 도달한 시각';
comment on column public.trades.flow_completed_at is 'UI 완료 버튼을 최초 클릭한 시각. in_progress에서도 기록';

comment on table public.trade_drafts is '사용자별 거래 방향·역할 조합의 작업 초안';
comment on column public.trade_drafts.documents is '업로드 파일 메타데이터 배열. File 객체 저장 금지';
comment on column public.trade_drafts.arrival_notice is '수입 포워더 도착통지서 메타데이터';
comment on column public.trade_drafts.current_step is '복구할 UI 단계(1~4)';

commit;

/*
 * ---------------------------------------------------------------------------
 * 실행 후 구조 검증용 SELECT (읽기 전용)
 * ---------------------------------------------------------------------------
 */

-- 생성된 컬럼
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('trades', 'trade_drafts')
order by table_name, ordinal_position;

-- CHECK 및 외래키/UNIQUE 제약조건
select
  c.conrelid::regclass as table_name,
  c.conname,
  c.contype,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid in ('public.trades'::regclass, 'public.trade_drafts'::regclass)
order by table_name::text, c.contype, c.conname;

-- 인덱스
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('trades', 'trade_drafts')
order by tablename, indexname;

-- RLS 활성화 여부
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('trades', 'trade_drafts');

-- 정책
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('trades', 'trade_drafts')
order by tablename, policyname;

-- 트리거
select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('trades', 'trade_drafts')
order by event_object_table, trigger_name;

/*
 * ---------------------------------------------------------------------------
 * 상태 CHECK 테스트
 * 첫 auth.users 사용자를 이용하며 모든 INSERT는 마지막 ROLLBACK으로 제거됩니다.
 * auth.users가 비어 있으면 테스트를 건너뜁니다.
 * ---------------------------------------------------------------------------
 */
begin;

do $$
declare
  test_user_id uuid;
  notice_meta jsonb := jsonb_build_object(
    'fileName', 'arrival-notice.pdf',
    'mimeType', 'application/pdf',
    'size', 123456,
    'uploadedAt', now()::text,
    'storagePath', 'test/arrival-notice.pdf'
  );
begin
  select id into test_user_id from auth.users order by created_at limit 1;
  if test_user_id is null then
    raise notice 'auth.users가 비어 있어 상태 INSERT 테스트를 건너뜁니다.';
    return;
  end if;

  -- 성공해야 하는 조합
  insert into public.trades (user_id, trade_direction, trade_role, status, generated_at)
    values (test_user_id, 'export', 'shipper', 'generated', now());
  insert into public.trades (user_id, trade_direction, trade_role, status, generated_at, submitted_at)
    values (test_user_id, 'export', 'forwarder', 'submitted', now(), now());
  insert into public.trades (user_id, trade_direction, trade_role, status, generated_at)
    values (test_user_id, 'import', 'shipper', 'generated', now());
  insert into public.trades (user_id, trade_direction, trade_role, status, generated_at, submitted_at)
    values (test_user_id, 'import', 'shipper', 'submitted', now(), now());
  insert into public.trades (user_id, trade_direction, trade_role, status, generated_at)
    values (test_user_id, 'import', 'forwarder', 'generated', now());
  insert into public.trades (user_id, trade_direction, trade_role, status, generated_at, flow_completed_at)
    values (test_user_id, 'import', 'forwarder', 'in_progress', now(), now());
  insert into public.trades (
    user_id, trade_direction, trade_role, status, arrival_notice,
    generated_at, submitted_at, flow_completed_at
  ) values (
    test_user_id, 'import', 'forwarder', 'submitted', notice_meta,
    now(), now(), now()
  );

  -- 아래 조합은 각각 CHECK 위반이어야 합니다.
  begin
    insert into public.trades (user_id, trade_direction, trade_role, status, generated_at)
      values (test_user_id, 'export', 'shipper', 'in_progress', now());
    raise exception '실패 예상 테스트가 통과했습니다: export+shipper+in_progress';
  exception when check_violation then null;
  end;
  begin
    insert into public.trades (user_id, trade_direction, trade_role, status, generated_at)
      values (test_user_id, 'export', 'forwarder', 'in_progress', now());
    raise exception '실패 예상 테스트가 통과했습니다: export+forwarder+in_progress';
  exception when check_violation then null;
  end;
  begin
    insert into public.trades (user_id, trade_direction, trade_role, status, generated_at)
      values (test_user_id, 'import', 'shipper', 'in_progress', now());
    raise exception '실패 예상 테스트가 통과했습니다: import+shipper+in_progress';
  exception when check_violation then null;
  end;
  begin
    insert into public.trades (user_id, trade_direction, trade_role, status)
      values (test_user_id, 'export', 'shipper', 'unknown_status');
    raise exception '실패 예상 테스트가 통과했습니다: unknown status';
  exception when check_violation then null;
  end;
  begin
    insert into public.trades (user_id, trade_direction, trade_role, status)
      values (test_user_id, 'domestic', 'shipper', 'draft');
    raise exception '실패 예상 테스트가 통과했습니다: invalid direction';
  exception when check_violation then null;
  end;
  begin
    insert into public.trades (user_id, trade_direction, trade_role, status)
      values (test_user_id, 'export', 'broker', 'draft');
    raise exception '실패 예상 테스트가 통과했습니다: invalid role';
  exception when check_violation then null;
  end;

  raise notice '거래 상태 CHECK 테스트가 모두 예상대로 완료되었습니다.';
end;
$$;

rollback;
