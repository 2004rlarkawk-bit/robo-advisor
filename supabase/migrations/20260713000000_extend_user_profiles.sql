-- 기존 user_profiles를 프로필/거래 기본값의 단일 원본으로 확장합니다.
-- 기존 컬럼, 데이터, RLS 정책 및 회원가입 프로필 생성 트리거는 변경하지 않습니다.
alter table public.user_profiles
  add column if not exists company_name text,
  add column if not exists business_number text,
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists country text,
  add column if not exists industry text,
  add column if not exists trade_purpose text,
  add column if not exists default_load_port text,
  add column if not exists default_discharge_port text,
  add column if not exists default_incoterm text;

comment on column public.user_profiles.trade_purpose is 'export, import, integrated';
comment on column public.user_profiles.industry is 'manufacturing, trading, forwarding, logistics, ecommerce, other';
