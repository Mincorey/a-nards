-- =============================================================================
-- A-NARDS · Фаза 5 — Переносим can_see_table в схему private.
-- SECURITY DEFINER-функция в public экспонируется PostgREST как RPC
-- (security-advisor 0029). В схеме private она не экспонируется, но по-прежнему
-- вызывается из RLS-политик. Идемпотентно.
-- =============================================================================

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.can_see_table(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.game_tables t
      where t.id = tid and (t.visibility = 'public' or t.owner_id = auth.uid())
    )
    or exists (
      select 1 from public.table_seats s
      where s.table_id = tid and s.user_id = auth.uid()
    );
$$;
grant execute on function private.can_see_table(uuid) to anon, authenticated;

drop policy if exists "gt_select" on public.game_tables;
create policy "gt_select" on public.game_tables for select using (private.can_see_table(id));

drop policy if exists "seat_select" on public.table_seats;
create policy "seat_select" on public.table_seats for select using (private.can_see_table(table_id));

drop policy if exists "games_select" on public.games;
create policy "games_select" on public.games for select using (private.can_see_table(table_id));

drop policy if exists "moves_select" on public.moves;
create policy "moves_select" on public.moves for select
  using (exists (select 1 from public.games g where g.id = game_id and private.can_see_table(g.table_id)));

drop function if exists public.can_see_table(uuid);
