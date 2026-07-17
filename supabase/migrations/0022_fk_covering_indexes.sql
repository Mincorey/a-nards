-- =============================================================================
-- A-NARDS · Covering-индексы для внешних ключей (unindexed_foreign_keys).
-- -----------------------------------------------------------------------------
-- Применить в Supabase: Dashboard -> SQL Editor -> New query -> вставить -> Run.
-- Идемпотентно (create index if not exists).
--
-- Зачем: у перечисленных FK-колонок нет ведущего индекса. Без него JOIN/фильтры
-- по этим колонкам и КАСКАДНЫЕ проверки при удалении родительской строки идут
-- seq scan'ом. При росте таблиц (особенно moves — журнал ходов) это деградирует.
-- Таблицы сейчас почти пусты — создать индексы дёшево и заранее.
--
-- Не покрываем FK, у которых ведущий индекс уже есть:
--   invites.table_id, moves.game_id (idx_moves_game), table_seats.table_id.
-- Композитные уникальные индексы (table_id, user_id)/(table_id, to_id) НЕ
-- покрывают FK по второй колонке (ведущая — table_id), поэтому нужны отдельные.
-- Док: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
-- =============================================================================

create index if not exists idx_friendships_requester on public.friendships (requester_id);
create index if not exists idx_friendships_addressee on public.friendships (addressee_id);

create index if not exists idx_game_tables_owner     on public.game_tables (owner_id);

create index if not exists idx_invites_from          on public.invites (from_id);
create index if not exists idx_invites_to            on public.invites (to_id);

create index if not exists idx_moves_player          on public.moves (player_id);

create index if not exists idx_table_seats_user      on public.table_seats (user_id);
