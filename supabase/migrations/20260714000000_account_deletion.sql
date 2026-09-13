-- Auth 사용자 삭제 시 본인의 프로필/거래만 함께 삭제되도록 FK를 보강합니다.
-- 기존 행은 수정하거나 삭제하지 않으며, 신규 FK는 기존 데이터 보호를 위해 NOT VALID로 추가합니다.
do $$
declare
  constraint_row record;
  has_cascade boolean := false;
begin
  for constraint_row in
    select c.conname, c.confdeltype
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.user_profiles'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.conkey = array[(select attnum from pg_attribute where attrelid = 'public.user_profiles'::regclass and attname = 'id')]
  loop
    if constraint_row.confdeltype = 'c' then
      has_cascade := true;
    else
      execute format('alter table public.user_profiles drop constraint %I', constraint_row.conname);
    end if;
  end loop;
  if not has_cascade then
    alter table public.user_profiles
      add constraint user_profiles_id_auth_users_fkey
      foreign key (id) references auth.users(id) on delete cascade not valid;
  end if;
end
$$;

do $$
declare
  constraint_row record;
  has_cascade boolean := false;
begin
  for constraint_row in
    select c.conname, c.confdeltype
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.trades'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.conkey = array[(select attnum from pg_attribute where attrelid = 'public.trades'::regclass and attname = 'user_id')]
  loop
    if constraint_row.confdeltype = 'c' then
      has_cascade := true;
    else
      execute format('alter table public.trades drop constraint %I', constraint_row.conname);
    end if;
  end loop;
  if not has_cascade then
    alter table public.trades
      add constraint trades_user_id_auth_users_fkey
      foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;
end
$$;
