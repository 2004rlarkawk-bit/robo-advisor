-- 프로필에서 선택적으로 관리하는 통관고유부호를 위한 비파괴 컬럼 추가안입니다.
-- 실제 Supabase에는 별도로 검토한 뒤 실행해야 합니다.
alter table public.user_profiles
  add column if not exists customs_clearance_code text;
