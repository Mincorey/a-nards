-- =============================================================================
-- A-NARDS · Аудит M3 — Ограничение длины display_name.
-- -----------------------------------------------------------------------------
-- Колонка profiles.display_name была text без ограничения длины — можно записать
-- гигантское имя (нагрузка/абьюз в списках). Ставим CHECK 1..40 символов.
-- Перед добавлением подрезаем уже существующие слишком длинные значения, иначе
-- ALTER ... ADD CONSTRAINT упадёт на старых данных.
-- Идемпотентно.
-- =============================================================================

update public.profiles
  set display_name = left(display_name, 40)
  where char_length(display_name) > 40;

alter table public.profiles drop constraint if exists display_name_length;
alter table public.profiles
  add constraint display_name_length
  check (char_length(display_name) between 1 and 40);
