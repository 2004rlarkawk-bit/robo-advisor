-- 수입/수출 및 화주/포워더 구분을 기존 거래에 비파괴적으로 추가합니다.
-- 기존 행은 지금까지 모두 수출 거래였으므로 export 기본값으로 보존합니다.
alter table public.trades
  add column if not exists trade_direction text not null default 'export',
  add column if not exists trade_role text,
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trades_trade_direction_check'
  ) then
    alter table public.trades
      add constraint trades_trade_direction_check
      check (trade_direction in ('export', 'import'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'trades_trade_role_check'
  ) then
    alter table public.trades
      add constraint trades_trade_role_check
      check (trade_role is null or trade_role in ('shipper', 'forwarder'));
  end if;
end $$;

create index if not exists trades_user_direction_created_idx
  on public.trades (user_id, trade_direction, created_at desc);

comment on column public.trades.trade_direction is '거래 방향: export 또는 import';
comment on column public.trades.trade_role is '거래 수행 역할: shipper 또는 forwarder';
comment on column public.trades.completed_at is '거래 플로우 완료 시각';
