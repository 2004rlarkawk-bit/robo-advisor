-- trades 행이 재생성/최종 제출로 UPDATE될 때 DB 시각으로 updated_at을 갱신합니다.
alter table public.trades
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_trades_updated_at()
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

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_trades_updated_at'
      and tgrelid = 'public.trades'::regclass
      and not tgisinternal
  ) then
    create trigger set_trades_updated_at
      before update on public.trades
      for each row execute function public.set_trades_updated_at();
  end if;
end
$$;
