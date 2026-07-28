-- 2026-07-23 편의성 업그레이드: 화주용 통관 입력 폼 확장
-- 프로필에서 실제 등록된 회사 기본정보만 화주 입력 화면에 표시하기 위한 비파괴 컬럼 추가안입니다.
alter table public.user_profiles
  add column if not exists company_name text,
  add column if not exists company_address text;
