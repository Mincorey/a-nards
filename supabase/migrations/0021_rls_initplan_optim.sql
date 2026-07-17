-- =============================================================================
-- A-NARDS · Оптимизация RLS: auth_rls_initplan.
-- -----------------------------------------------------------------------------
-- Применить в Supabase: Dashboard -> SQL Editor -> New query -> вставить -> Run.
-- Идемпотентно (drop policy if exists + create policy).
--
-- Что делает: заменяет прямые вызовы auth.uid() в RLS-политиках на
-- (select auth.uid()). Планировщик Postgres вычисляет подзапрос ОДИН раз на
-- запрос (InitPlan), а не на каждую строку — заметно дешевле SELECT/UPDATE на
-- больших выборках (лобби, рейтинги, друзья). Семантика политик НЕ меняется:
-- (select auth.uid()) возвращает то же значение, что и auth.uid().
-- Док: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Затрагиваются 16 политик на 6 таблицах:
--   profiles, game_tables, table_seats, invites, friendships, table_secrets.
-- Политики через private.can_see_table(...) (games_select, moves_select,
-- seat_select) НЕ трогаем — в их выражении нет прямого auth.uid().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles  (profiles_select_all с using(true) не трогаем — там нет auth.uid())
-- ---------------------------------------------------------------------------
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert
  with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- game_tables
-- ---------------------------------------------------------------------------
drop policy if exists gt_insert on public.game_tables;
create policy gt_insert on public.game_tables for insert
  with check ((select auth.uid()) = owner_id);

drop policy if exists gt_update_owner on public.game_tables;
create policy gt_update_owner on public.game_tables for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists gt_delete_owner on public.game_tables;
create policy gt_delete_owner on public.game_tables for delete
  using ((select auth.uid()) = owner_id);

drop policy if exists gt_select on public.game_tables;
create policy gt_select on public.game_tables for select
  using (
    visibility = 'public'
    or (visibility = 'private' and status = 'waiting' and (select auth.uid()) is not null)
    or owner_id = (select auth.uid())
    or exists (
      select 1 from public.table_seats s
      where s.table_id = game_tables.id and s.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- table_seats  (seat_select через can_see_table не трогаем)
-- ---------------------------------------------------------------------------
drop policy if exists seat_insert_self on public.table_seats;
create policy seat_insert_self on public.table_seats for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists seat_update_self on public.table_seats;
create policy seat_update_self on public.table_seats for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists seat_delete_self on public.table_seats;
create policy seat_delete_self on public.table_seats for delete
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- invites
-- ---------------------------------------------------------------------------
drop policy if exists inv_insert on public.invites;
create policy inv_insert on public.invites for insert
  with check ((select auth.uid()) = from_id);

drop policy if exists inv_select on public.invites;
create policy inv_select on public.invites for select
  using ((select auth.uid()) = from_id or (select auth.uid()) = to_id);

drop policy if exists inv_update_to on public.invites;
create policy inv_update_to on public.invites for update
  using ((select auth.uid()) = to_id)
  with check ((select auth.uid()) = to_id);

-- ---------------------------------------------------------------------------
-- friendships
-- ---------------------------------------------------------------------------
drop policy if exists fr_select on public.friendships;
create policy fr_select on public.friendships for select
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

drop policy if exists fr_insert on public.friendships;
create policy fr_insert on public.friendships for insert
  with check ((select auth.uid()) = requester_id and requester_id <> addressee_id);

drop policy if exists fr_update on public.friendships;
create policy fr_update on public.friendships for update
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id)
  with check ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

drop policy if exists fr_delete on public.friendships;
create policy fr_delete on public.friendships for delete
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

-- ---------------------------------------------------------------------------
-- table_secrets  (только INSERT-политика; SELECT-политик нет — by design)
-- ---------------------------------------------------------------------------
drop policy if exists secret_insert_owner on public.table_secrets;
create policy secret_insert_owner on public.table_secrets for insert
  with check (
    exists (
      select 1 from public.game_tables t
      where t.id = table_secrets.table_id and t.owner_id = (select auth.uid())
    )
  );
