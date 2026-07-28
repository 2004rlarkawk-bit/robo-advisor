-- 2026-07-23 편의성 업그레이드: 회원 서비스 역할 타입 및 프로필 저장 구조 추가
-- 회원 서비스 역할은 보안 권한이 아니라 기본 작업 화면을 결정하는 사용자 설정입니다.
alter table public.user_profiles
  add column if not exists service_role text
  not null default 'integrated';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_service_role_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_service_role_check
      check (
        service_role in (
          'shipper',
          'forwarder',
          'integrated'
        )
      );
  end if;
end
$$;
