-- =============================================================================
-- A-NARDS · Телефон игрока (для вывода средств из внутриигрового кошелька).
-- -----------------------------------------------------------------------------
-- Применить в Supabase: Dashboard -> SQL Editor -> New query -> вставить -> Run.
-- Идемпотентно. Хранение в каноничном виде E.164: +7XXXXXXXXXX.
-- Обновление своего профиля разрешено существующей RLS-политикой profiles.
-- =============================================================================
alter table public.profiles add column if not exists phone text;

alter table public.profiles drop constraint if exists profiles_phone_format;
alter table public.profiles add constraint profiles_phone_format
  check (phone is null or phone ~ '^\+7\d{10}$');

comment on column public.profiles.phone is
  'Телефон игрока для вывода средств (E.164, формат +7XXXXXXXXXX). Заполняется самим игроком.';
