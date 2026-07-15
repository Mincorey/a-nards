-- =============================================================================
-- 0018_finalize_game_idempotent.sql
-- Делает public.finalize_game ИДЕМПОТЕНТНОЙ: статистика и рейтинг (Elo)
-- применяются РОВНО ОДИН РАЗ — в момент, когда партия впервые переходит в
-- 'finished'. Раньше апдейт games был защищён (where status <> 'finished'), но
-- обновления профилей (games_played/games_won/rating) выполнялись при КАЖДОМ
-- вызове. Из-за этого повторный вызов (например, гонка resign + claim-timeout,
-- либо двойная сдача) мог начислить/списать рейтинг дважды. Теперь весь блок
-- статистики/рейтинга выполняется только если строка games реально сменила
-- статус в этом вызове.
-- Идемпотентно (create or replace) — безопасно применять повторно.
-- =============================================================================

create or replace function public.finalize_game(p_game_id uuid, p_winner char)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table   uuid;
  w_user    uuid;  -- победитель
  l_user    uuid;  -- проигравший
  w_rating  integer;
  l_rating  integer;
  expected  double precision;
  k         constant integer := 24;
  v_changed integer;
begin
  select table_id into v_table from public.games where id = p_game_id;
  if v_table is null then return; end if;

  -- Переводим партию в 'finished' ТОЛЬКО если она ещё не завершена, и узнаём,
  -- изменилась ли строка в этом вызове (защита от повторной финализации).
  update public.games
    set status = 'finished', winner = p_winner, ended_at = now()
    where id = p_game_id and status <> 'finished';
  get diagnostics v_changed = row_count;

  -- Уже была финализирована ранее — ничего больше не делаем (идемпотентность).
  if v_changed = 0 then
    return;
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
end;
$$;

revoke execute on function public.finalize_game(uuid, char) from public, anon, authenticated;
