-- =============================================================================
-- A-NARDS · Аудит M3 (продолжение) — Обрезка display_name в триггере регистрации.
-- -----------------------------------------------------------------------------
-- После добавления CHECK display_name_length (1..40) в 0011 автосоздание профиля
-- (handle_new_user) могло падать, если display_name из метаданных или локальной
-- части email длиннее 40 символов → регистрация ломалась бы. Оборачиваем значение
-- в left(..., 40). Логика username не меняется. Идемпотентно.
-- =============================================================================

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
  base_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'), ''),
    'player'
  );
  base_name := left(base_name, 12);
  if length(base_name) < 3 then
    base_name := 'player';
  end if;
  uname := base_name || '_' || left(replace(new.id::text, '-', ''), 4);

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    uname,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'username', ''),
      split_part(new.email, '@', 1)
    ), 40)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
