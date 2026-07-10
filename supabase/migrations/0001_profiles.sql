-- =============================================================================
-- A-NARDS · Фаза 4 — Профили, триггер регистрации, RLS, Storage (аватары)
-- -----------------------------------------------------------------------------
-- Применить в Supabase проекта A-NARDS: Dashboard → SQL Editor → New query →
-- вставить весь файл → Run. Идемпотентно (можно прогонять повторно).
-- =============================================================================

-- 1) Таблица профилей -------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique not null,
  display_name  text not null,
  avatar_url    text,
  rating        integer not null default 1200,
  games_played  integer not null default 0,
  games_won     integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-zA-Z0-9_]{3,20}$')
);

comment on table public.profiles is 'Профиль игрока (1:1 с auth.users).';

-- updated_at автоматически
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 2) Автосоздание профиля при регистрации -----------------------------------
-- SECURITY DEFINER → вставка идёт от владельца, в обход RLS.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  uname     text;
begin
  -- username: из метаданных, иначе из локальной части email, иначе из id.
  base_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'), ''),
    'player'
  );
  -- подгоняем под ограничение длины/символов
  base_name := left(base_name, 12); -- 12 + "_" + 4 hex = максимум 17 (<= 20 в CHECK)
  if length(base_name) < 3 then
    base_name := 'player';
  end if;
  -- гарантируем уникальность, добавляя короткий суффикс из id
  uname := base_name || '_' || left(replace(new.id::text, '-', ''), 4);

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    uname,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'username', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Триггерную функцию нельзя дёргать как RPC — отзываем EXECUTE (триггер работает от владельца).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3) RLS на profiles --------------------------------------------------------
alter table public.profiles enable row level security;

-- Читать профили может любой (нужно для лобби/друзей/таблицы лидеров).
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

-- Менять/создавать можно только свой профиль.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4) Storage: bucket аватаров ----------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Публичное чтение — через public-URL (RLS на чтение не нужна; широкая SELECT-политика
-- позволяла бы листинг всех файлов, поэтому её НЕ создаём — см. security-advisor 0025).
drop policy if exists "avatars_public_read" on storage.objects;

-- Загрузка/замена/удаление — только в свою папку <uid>/...
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5) Бэкофилл профилей для уже существующих пользователей --------------------
insert into public.profiles (id, username, display_name)
select
  u.id,
  'player_' || left(replace(u.id::text, '-', ''), 8),
  coalesce(split_part(u.email, '@', 1), 'Игрок')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;
