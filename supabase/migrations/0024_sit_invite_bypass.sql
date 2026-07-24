-- =============================================================================
-- 0024_sit_invite_bypass.sql — Приглашённый гость садится без пароля.
-- -----------------------------------------------------------------------------
-- Дополняет sit_at_table (0023): при посадке за ПРИВАТНЫЙ стол пароль НЕ требуется
-- тем, у кого есть активное приглашение (invites.status='pending'). Заморозка
-- ставки денежного стола при этом сохраняется (эскроу как обычно). Так приём
-- приглашения проходит через тот же безопасный путь с эскроу, а не в обход.
-- Идемпотентно (create or replace).
-- =============================================================================

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

  if exists (select 1 from public.table_seats where table_id = p_table and user_id = v_uid) then
    return; -- уже сидим — идемпотентно
  end if;

  -- Приватный стол — пароль обязателен всем, КРОМЕ владельца и приглашённого
  -- гостя (у которого есть активное приглашение за этот стол).
  if v_vis = 'private' and v_uid <> v_owner then
    if not exists (select 1 from public.invites
                   where table_id = p_table and to_id = v_uid and status = 'pending') then
      select password into v_secret from public.table_secrets where table_id = p_table;
      if v_secret is null or p_password is null or p_password <> v_secret then
        raise exception 'invalid password';
      end if;
    end if;
  end if;

  select count(*) into v_count from public.table_seats where table_id = p_table;
  if v_count >= 2 then
    raise exception 'table full';
  end if;

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

  -- Денежный стол: замораживаем ставку (эскроу), проверив достаточность средств.
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
