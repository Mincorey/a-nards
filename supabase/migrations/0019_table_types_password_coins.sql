-- =============================================================================
-- A-NARDS · Типы столов: приватный вход по паролю + столы за COINS.
-- -----------------------------------------------------------------------------
-- Применить в Supabase проекта A-NARDS: Dashboard -> SQL Editor -> New query ->
-- вставить весь файл -> Run. Идемпотентно (можно прогонять повторно).
--
-- Что делает:
--  1) Защищённая таблица table_secrets — пароль приватного стола. Клиенты её НЕ
--     читают: сверку делает только SECURITY DEFINER-функция join_table_secure.
--  2) RLS game_tables: приватные столы в статусе waiting теперь ВИДНЫ в лобби
--     (с «замком»), но вход в них — только по паролю через RPC.
--  3) join_table_secure(p_table, p_password) — безопасная посадка за стол:
--     сверяет пароль (для приватных), проверяет число мест и сажает игрока.
--
-- Режим стола (normal | coins) и ставка COINS хранятся в game_tables.settings
-- (jsonb, не секретные данные) — миграции для них не нужно. Резервирование COINS
-- на балансе игроков — БУДУЩАЯ доработка (сейчас ставка носит справочный характер).
-- =============================================================================

-- 1) Защищённая таблица паролей приватных столов ------------------------------
create table if not exists public.table_secrets (
  table_id   uuid primary key references public.game_tables (id) on delete cascade,
  password   text not null,
  created_at timestamptz not null default now()
);

alter table public.table_secrets enable row level security;

-- Владелец стола может ЗАПИСАТЬ пароль (в момент создания стола).
drop policy if exists secret_insert_owner on public.table_secrets;
create policy secret_insert_owner on public.table_secrets for insert
  with check (
    exists (
      select 1 from public.game_tables t
      where t.id = table_secrets.table_id and t.owner_id = auth.uid()
    )
  );

-- Намеренно НЕТ политик select/update/delete: читать пароль напрямую нельзя
-- никому. Его использует только join_table_secure (SECURITY DEFINER). При
-- удалении стола секрет удаляется каскадно по внешнему ключу.

-- 2) RLS game_tables: показываем приватные waiting-столы в лобби --------------
-- Сохраняем приём из 0007 (без под-запроса к самой game_tables, чтобы не
-- сломать INSERT ... RETURNING), лишь добавляя видимость приватных waiting.
drop policy if exists gt_select on public.game_tables;
create policy gt_select on public.game_tables
  for select
  using (
    visibility = 'public'
    or (visibility = 'private' and status = 'waiting' and auth.uid() is not null)
    or owner_id = auth.uid()
    or exists (
      select 1 from public.table_seats s
      where s.table_id = game_tables.id and s.user_id = auth.uid()
    )
  );

-- 3) Безопасная посадка за стол ----------------------------------------------
create or replace function public.join_table_secure(p_table uuid, p_password text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_vis    text;
  v_status text;
  v_secret text;
  v_count  int;
  v_seat   smallint;
  v_color  char(1);
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select visibility, status into v_vis, v_status
  from public.game_tables where id = p_table;
  if not found then
    raise exception 'table not found';
  end if;
  if v_status <> 'waiting' then
    raise exception 'table not available';
  end if;

  -- Уже сидим за этим столом — идемпотентно выходим (повторный клик безопасен).
  if exists (select 1 from public.table_seats where table_id = p_table and user_id = v_uid) then
    return;
  end if;

  -- Приватный стол — сверяем пароль с защищённой table_secrets.
  if v_vis = 'private' then
    select password into v_secret from public.table_secrets where table_id = p_table;
    if v_secret is null or p_password is null or p_password <> v_secret then
      raise exception 'invalid password';
    end if;
  end if;

  select count(*) into v_count from public.table_seats where table_id = p_table;
  if v_count >= 2 then
    raise exception 'table full';
  end if;

  -- Свободное место и цвет (владелец сидит на 0/белые -> второй на 1/чёрные).
  if exists (select 1 from public.table_seats where table_id = p_table and seat = 0) then
    v_seat := 1;
  else
    v_seat := 0;
  end if;
  if exists (select 1 from public.table_seats where table_id = p_table and color = 'w') then
    v_color := 'b';
  else
    v_color := 'w';
  end if;

  insert into public.table_seats (table_id, user_id, seat, color, is_ready)
  values (p_table, v_uid, v_seat, v_color, true);
end;
$$;

revoke execute on function public.join_table_secure(uuid, text) from public, anon;
grant execute on function public.join_table_secure(uuid, text) to authenticated;
