-- 담당 특화 분야에 '품목' 묶음을 더한다.
--
-- 지금까지 추천 조건은 항로(도착항 국가)와 화물 취급 방식(FCL·LCL·콜드체인 등)만 봤다.
-- 그래서 사무용 책상처럼 특별한 취급이 필요 없는 일반 화물은 품목에 대한 조건이 하나도 잡히지 않았다.
-- HS 류(앞 2자리)로 뽑을 수 있는 품목 묶음 5개를 더해, 무엇을 실어 보내는지에 익숙한 담당자를
-- 함께 고를 수 있게 한다. 거래 정보에서 뽑아낼 수 있는 키라 자동 배정 점수에 그대로 들어간다.
--
-- 기존 값은 전부 새 목록에도 들어 있어 데이터 이전이 필요 없다. 재실행해도 안전하다.

begin;

alter table public.user_profiles
  drop constraint if exists user_profiles_forwarder_specialties_check;

alter table public.user_profiles
  add constraint user_profiles_forwarder_specialties_check
  check (forwarder_specialties <@ array[
    'route_cn', 'route_us', 'route_jp', 'route_vn', 'route_sea', 'route_twhk',
    'route_in', 'route_eu', 'route_me', 'route_cis', 'route_latam',
    'cargo_fcl', 'cargo_lcl', 'cargo_cold', 'cargo_dg', 'cargo_air',
    'cargo_oog', 'cargo_express',
    'goods_consumer', 'goods_apparel', 'goods_electronics', 'goods_food', 'goods_chemical'
  ]::text[]);

commit;
