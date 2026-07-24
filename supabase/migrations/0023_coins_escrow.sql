-- =============================================================================
-- 0023_coins_escrow.sql — Внутриигровая валюта A-COINS с эскроу денежных столов.
-- -----------------------------------------------------------------------------
-- Тестовый режим: коины вымышленные, начисляются вручную. Реальные платежи —
-- позже. Здесь реализована ЭКОНОМИКА денежного стола:
--   • у каждого игрока есть баланс profiles.coins;
--   • чтобы СЕСТЬ за денежный стол (ставка S), у игрока ЗАМОРАЖИВАЕТСЯ S коинов
--     (списываются с баланса в эскроу; проверяется достаточность средств);
--   • ПОБЕДИТЕЛЬ получает назад свою ставку S + 50% ставки соперника (S/2);
--   • оставшиеся 50% ставки соперника уходят ПЛАТФОРМЕ (platform_wallet);
--   • при выходе из стола ДО завершения партии заморозка ВОЗВРАЩАЕТСЯ игроку.
-- Все движения коинов пишутся в coin_ledger (история/аудит). Сумма коинов в
-- системе (игроки + платформа) СОХРАНЯЕТСЯ — ничего не теряется.
-- Идемпотентно (можно прогонять повторно).
-- =============================================================================

-- 1) Баланс коинов игрока -----------------------------------------------------
alter table public.profiles add column if not exists coins integer not null default 1000;

-- 2) Заморозка ставки на конкретном месте (эскроу) ----------------------------
alter table public.table_seats add column if not exists coins_locked integer not null default 0;

-- 3) Кошелёк платформы (единственная строка) ----------------------------------
create table if not exists public.platform_wallet (
  id    boolean primary key default true,
  coins bigint  not null default 0,
  constraint platform_wallet_singleton check (id)
);
insert into public.platform_wallet (id, coins) values (true, 0) on conflict (id) do nothing;
alter table public.platform_wallet enable row level security;
-- Клиентам платёжный кошелёк платформы не показываем (нет политик select).

-- 4) Журнал движений коинов (история/аудит) -----------------------------------
create table if not exists public.coin_ledger (
  id            bigserial primary key,
  user_id       uuid references public.profiles (id) on delete set null,
  table_id      uuid,
  delta         integer not null,           -- + начисление, − списание (0 — пометка)
  reason        text    not null,           -- stake_lock | stake_refund | win_payout | loss_settled | platform_fee | admin_grant
  balance_after integer,
  created_at    timestamptz not null default now()
);
create index if not exists coin_ledger_user_idx on public.coin_ledger (user_id, created_at desc);

alter table public.coin_ledger enable row level security;
-- Игрок видит только свои записи истории.
drop policy if exists ledger_select_own on public.coin_ledger;
create policy ledger_select_own on public.coin_ledger for select
  using (user_id = (select auth.uid()));

-- 5) Универсальная посадка за стол с эскроу ------------------------------------
-- Заменяет прежнюю join_table_secure: сажает КАК владельца (при создании стола),
-- ТАК и гостя (по паролю для приватного). Для денежного стола атомарно
-- замораживает ставку — либо посадка+заморозка проходят вместе, либо ничего.
create or replace function public.sit_at_table(p_table uuid, p_password text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_vis    text;
  v_status text;
  v_secret text;
  v_mode   text;
  v_stake  int;
  v_count  int;
  v_seat   smallint;
  v_color  char(1);
  v_bal    int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select owner_id, visibility, status,
         coalesce(settings->>'mode', 'normal'),
         coalesce((settings->>'coins')::int, 0)
    into v_owner, v_vis, v_status, v_mode, v_stake
    from public.game_tables where id = p_table;
  if not found then
    raise exception 'table not found';
  end if;
  if v_status <> 'waiting' then
    raise exception 'table not available';
  end if;

  -- Уже сидим — идемпотентно (повторный клик безопасен, повторной заморозки нет).
  if exists (select 1 from public.table_seats where table_id = p_table and user_id = v_uid) then
    return;
  end if;

  -- Приватный стол — пароль обязателен всем, КРОМЕ владельца (он его и задал).
  if v_vis = 'private' and v_uid <> v_owner then
    select password into v_secret from public.table_secrets where table_id = p_table;
    if v_secret is null or p_password is null or p_password <> v_secret then
      raise exception 'invalid password';
    end if;
  end if;

  select count(*) into v_count from public.table_seats where table_id = p_table;
  if v_count >= 2 then
    raise exception 'table full';
  end if;

  -- Свободное место и цвет (первый -> 0/белые, второй -> 1/чёрные).
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

  -- Денежный стол: замораживаем ставку (эскроу). Достаточность средств —
  -- обязательное условие посадки.
  if v_mode = 'coins' and v_stake > 0 then
    select coins into v_bal from public.profiles where id = v_uid for update;
    if coalesce(v_bal, 0) < v_stake then
      raise exception 'insufficient coins';
    end if;
    update public.profiles set coins = coins - v_stake where id = v_uid;
    insert into public.coin_ledger (user_id, table_id, delta, reason, balance_after)
      values (v_uid, p_table, -v_stake, 'stake_lock', v_bal - v_stake);
    insert into public.table_seats (table_id, user_id, seat, color, is_ready, coins_locked)
      values (p_table, v_uid, v_seat, v_color, true, v_stake);
  else
    insert into public.table_seats (table_id, user_id, seat, color, is_ready, coins_locked)
      values (p_table, v_uid, v_seat, v_color, true, 0);
  end if;
end;
$$;

revoke execute on function public.sit_at_table(uuid, text) from public, anon;
grant  execute on function public.sit_at_table(uuid, text) to authenticated;

-- Обратная совместимость: старое имя делегирует новой функции.
create or replace function public.join_table_secure(p_table uuid, p_password text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sit_at_table(p_table, p_password);
end;
$$;

revoke execute on function public.join_table_secure(uuid, text) from public, anon;
grant  execute on function public.join_table_secure(uuid, text) to authenticated;

-- 6) Возврат заморозки при удалении места -------------------------------------
-- Любое удаление места с ненулевой заморозкой (выход из стола до старта, удаление
-- стола, уборка «зомби») ВОЗВРАЩАЕТ коины игроку. После расчёта партии
-- finalize_game обнуляет coins_locked, поэтому повторного возврата не происходит.
create or replace function public.refund_seat_coins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.coins_locked is not null and old.coins_locked > 0 and old.user_id is not null then
    update public.profiles set coins = coins + old.coins_locked where id = old.user_id;
    insert into public.coin_ledger (user_id, table_id, delta, reason)
      values (old.user_id, old.table_id, old.coins_locked, 'stake_refund');
  end if;
  return old;
end;
$$;

drop trigger if exists trg_refund_seat_coins on public.table_seats;
create trigger trg_refund_seat_coins
  before delete on public.table_seats
  for each row execute function public.refund_seat_coins();

-- 7) finalize_game — расчёт эскроу денежного стола (идемпотентно) --------------
-- Дополняет прежнюю функцию: в момент ПЕРВОГО перехода партии в 'finished'
-- начисляет статистику/рейтинг И распределяет ставки денежного стола.
create or replace function public.finalize_game(p_game_id uuid, p_winner char)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table    uuid;
  w_user     uuid;  -- победитель
  l_user     uuid;  -- проигравший
  w_rating   integer;
  l_rating   integer;
  expected   double precision;
  k          constant integer := 24;
  v_changed  integer;
  v_mode     text;
  v_stake    int;
  w_lock     int;
  l_lock     int;
  v_win_share int;
  v_platform int;
begin
  select table_id into v_table from public.games where id = p_game_id;
  if v_table is null then return; end if;

  -- Переводим партию в 'finished' ТОЛЬКО если она ещё не завершена.
  update public.games
    set status = 'finished', winner = p_winner, ended_at = now()
    where id = p_game_id and status <> 'finished';
  get diagnostics v_changed = row_count;

  if v_changed = 0 then
    return; -- уже финализирована ранее — идемпотентность
  end if;

  update public.game_tables set status = 'finished' where id = v_table;

  -- пользователи по цвету (могут быть null для бота)
  select user_id into w_user from public.table_seats where table_id = v_table and color = p_winner;
  select user_id into l_user from public.table_seats
    where table_id = v_table and color = (case when p_winner = 'w' then 'b' else 'w' end);

  -- статистика
  if w_user is not null then
    update public.profiles set games_played = games_played + 1, games_won = games_won + 1
      where id = w_user;
  end if;
  if l_user is not null then
    update public.profiles set games_played = games_played + 1 where id = l_user;
  end if;

  -- рейтинг (Elo) — только для партий человек-против-человека
  if w_user is not null and l_user is not null then
    select rating into w_rating from public.profiles where id = w_user;
    select rating into l_rating from public.profiles where id = l_user;
    expected := 1.0 / (1.0 + power(10.0, (l_rating - w_rating) / 400.0));
    update public.profiles set rating = w_rating + round(k * (1 - expected))::int where id = w_user;
    update public.profiles set rating = greatest(100, l_rating + round(k * (0 - (1 - expected)))::int) where id = l_user;
  end if;

  -- денежный стол: распределяем эскроу РОВНО один раз (в этом же переходе)
  select coalesce(settings->>'mode', 'normal'), coalesce((settings->>'coins')::int, 0)
    into v_mode, v_stake from public.game_tables where id = v_table;

  if v_mode = 'coins' and v_stake > 0 and w_user is not null and l_user is not null then
    select coins_locked into w_lock from public.table_seats where table_id = v_table and user_id = w_user;
    select coins_locked into l_lock from public.table_seats where table_id = v_table and user_id = l_user;
    w_lock := coalesce(w_lock, 0);
    l_lock := coalesce(l_lock, 0);

    v_win_share := floor(l_lock::numeric / 2)::int;  -- 50% ставки соперника — победителю
    v_platform  := l_lock - v_win_share;             -- остаток ставки соперника — платформе

    -- победителю: возврат своей ставки + доля от ставки соперника
    update public.profiles set coins = coins + w_lock + v_win_share where id = w_user;
    insert into public.coin_ledger (user_id, table_id, delta, reason)
      values (w_user, v_table, w_lock + v_win_share, 'win_payout');

    -- проигравший: ставка сгорела (0 к возврату) — пометка в истории
    insert into public.coin_ledger (user_id, table_id, delta, reason)
      values (l_user, v_table, 0, 'loss_settled');

    -- платформе — её доля
    if v_platform > 0 then
      update public.platform_wallet set coins = coins + v_platform where id = true;
      insert into public.coin_ledger (user_id, table_id, delta, reason)
        values (null, v_table, v_platform, 'platform_fee');
    end if;

    -- снимаем заморозку, чтобы триггер возврата не сработал при удалении мест
    update public.table_seats set coins_locked = 0
      where table_id = v_table and user_id in (w_user, l_user);
  end if;
end;
$$;

revoke execute on function public.finalize_game(uuid, char) from public, anon, authenticated;
