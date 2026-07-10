-- =============================================================================
-- A-NARDS · Фаза 5 — Онлайн-инфраструктура: столы, места, партии, ходы, инвайты
-- RLS + Realtime + finalize_game (статистика/рейтинг). Идемпотентно.
-- =============================================================================

-- 1) Таблицы ----------------------------------------------------------------
create table if not exists public.game_tables (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  variant     text not null default 'short' check (variant in ('short', 'long')),
  visibility  text not null default 'public' check (visibility in ('public', 'private')),
  settings    jsonb not null default '{}'::jsonb,
  status      text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  created_at  timestamptz not null default now()
);

create table if not exists public.table_seats (
  id        uuid primary key default gen_random_uuid(),
  table_id  uuid not null references public.game_tables (id) on delete cascade,
  user_id   uuid references public.profiles (id) on delete cascade,
  seat      smallint not null check (seat in (0, 1)),
  color     char(1) not null check (color in ('w', 'b')),
  is_ready  boolean not null default false,
  is_bot    boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (table_id, seat),
  unique (table_id, user_id)
);

create table if not exists public.games (
  id           uuid primary key default gen_random_uuid(),
  table_id     uuid not null references public.game_tables (id) on delete cascade,
  variant      text not null default 'short',
  state        jsonb not null,
  turn         char(1) not null check (turn in ('w', 'b')),
  dice         integer[] not null default '{}',
  rolled       integer[],
  seed         bigint not null default 0,
  match_score  jsonb not null default '{}'::jsonb,
  status       text not null default 'playing' check (status in ('playing', 'finished')),
  winner       char(1) check (winner in ('w', 'b')),
  ply          integer not null default 0,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  updated_at   timestamptz not null default now()
);
create index if not exists idx_games_table on public.games (table_id);

create table if not exists public.moves (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games (id) on delete cascade,
  player_id  uuid references public.profiles (id),
  ply        integer not null,
  roll       integer[],
  moves      jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_moves_game on public.moves (game_id);

create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  table_id   uuid not null references public.game_tables (id) on delete cascade,
  from_id    uuid not null references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (table_id, to_id)
);

-- updated_at для games
drop trigger if exists trg_games_updated_at on public.games;
create trigger trg_games_updated_at
  before update on public.games
  for each row execute function public.touch_updated_at();

-- 2) Хелпер видимости (SECURITY DEFINER → без рекурсии RLS) ------------------
create or replace function public.can_see_table(tid uuid)
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
revoke execute on function public.can_see_table(uuid) from public, anon;

-- 3) RLS --------------------------------------------------------------------
alter table public.game_tables enable row level security;
alter table public.table_seats enable row level security;
alter table public.games       enable row level security;
alter table public.moves       enable row level security;
alter table public.invites     enable row level security;

-- game_tables
drop policy if exists "gt_select" on public.game_tables;
create policy "gt_select" on public.game_tables for select
  using (public.can_see_table(id));
drop policy if exists "gt_insert" on public.game_tables;
create policy "gt_insert" on public.game_tables for insert
  with check (auth.uid() = owner_id);
drop policy if exists "gt_update_owner" on public.game_tables;
create policy "gt_update_owner" on public.game_tables for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "gt_delete_owner" on public.game_tables;
create policy "gt_delete_owner" on public.game_tables for delete
  using (auth.uid() = owner_id);

-- table_seats
drop policy if exists "seat_select" on public.table_seats;
create policy "seat_select" on public.table_seats for select
  using (public.can_see_table(table_id));
drop policy if exists "seat_insert_self" on public.table_seats;
create policy "seat_insert_self" on public.table_seats for insert
  with check (auth.uid() = user_id);
drop policy if exists "seat_update_self" on public.table_seats;
create policy "seat_update_self" on public.table_seats for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "seat_delete_self" on public.table_seats;
create policy "seat_delete_self" on public.table_seats for delete
  using (auth.uid() = user_id);

-- games / moves: читают участники/зрители публичного стола; запись только сервер.
drop policy if exists "games_select" on public.games;
create policy "games_select" on public.games for select
  using (public.can_see_table(table_id));
drop policy if exists "moves_select" on public.moves;
create policy "moves_select" on public.moves for select
  using (exists (select 1 from public.games g where g.id = game_id and public.can_see_table(g.table_id)));

-- invites
drop policy if exists "inv_select" on public.invites;
create policy "inv_select" on public.invites for select
  using (auth.uid() = from_id or auth.uid() = to_id);
drop policy if exists "inv_insert" on public.invites;
create policy "inv_insert" on public.invites for insert
  with check (auth.uid() = from_id);
drop policy if exists "inv_update_to" on public.invites;
create policy "inv_update_to" on public.invites for update
  using (auth.uid() = to_id) with check (auth.uid() = to_id);

-- 4) Финализация партии: статистика + Elo (SECURITY DEFINER) -----------------
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
begin
  select table_id into v_table from public.games where id = p_game_id;
  if v_table is null then return; end if;

  -- пользователи по цвету (могут быть null для бота)
  select user_id into w_user from public.table_seats where table_id = v_table and color = p_winner;
  select user_id into l_user from public.table_seats
    where table_id = v_table and color = (case when p_winner = 'w' then 'b' else 'w' end);

  update public.games
    set status = 'finished', winner = p_winner, ended_at = now()
    where id = p_game_id and status <> 'finished';
  update public.game_tables set status = 'finished' where id = v_table;

  -- статистика и рейтинг
  if w_user is not null then
    update public.profiles set games_played = games_played + 1, games_won = games_won + 1
      where id = w_user;
  end if;
  if l_user is not null then
    update public.profiles set games_played = games_played + 1 where id = l_user;
  end if;

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

-- 5) Realtime ---------------------------------------------------------------
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.game_tables'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.table_seats'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.games';       exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.invites';     exception when duplicate_object then null; end;
end $$;
