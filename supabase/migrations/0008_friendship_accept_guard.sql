-- =============================================================================
-- A-NARDS · Аудит H1 — Только адресат может ПРИНЯТЬ заявку в друзья.
-- -----------------------------------------------------------------------------
-- Проблема: политика fr_update (0006) разрешает UPDATE обеим сторонам связи, а
-- RLS не умеет сравнивать старое/новое значение строки. Из-за этого ОТПРАВИТЕЛЬ
-- заявки мог сам перевести свою исходящую заявку pending -> accepted и добавить
-- человека в друзья без его согласия (через прямой вызов update по id).
--
-- Решение: BEFORE UPDATE-триггер, который валидирует переходы статуса по auth.uid():
--   • pending -> accepted            — только адресат (addressee_id);
--   • {pending|accepted} -> blocked  — любая из сторон;
--   • любой другой переход статуса   — запрещён.
-- Смена не-статусных полей (updated_at) не ограничивается.
--
-- Совместимость: путь «встречная заявка» в клиенте (sendFriendRequest) принимает
-- реверс-заявку, где текущий пользователь = addressee_id → разрешено триггером.
--
-- Идемпотентно (create or replace / drop trigger if exists).
-- =============================================================================

create or replace function public.friendships_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Статус не меняется — прочие поля не ограничиваем.
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Принятие заявки: только адресат pending-заявки.
  if old.status = 'pending' and new.status = 'accepted' then
    if auth.uid() = old.addressee_id then
      return new;
    end if;
    raise exception 'Принять заявку в друзья может только её адресат';
  end if;

  -- Блокировка: любая из сторон связи (из pending или accepted).
  if new.status = 'blocked' and old.status in ('pending', 'accepted') then
    if auth.uid() = old.requester_id or auth.uid() = old.addressee_id then
      return new;
    end if;
    raise exception 'Недостаточно прав для блокировки';
  end if;

  -- Прочие переходы статуса запрещены.
  raise exception 'Недопустимый переход статуса заявки: % -> %', old.status, new.status;
end;
$$;

drop trigger if exists trg_friendships_guard_update on public.friendships;
create trigger trg_friendships_guard_update
  before update on public.friendships
  for each row execute function public.friendships_guard_update();

-- Триггерную функцию нельзя дёргать как RPC — отзываем EXECUTE.
revoke execute on function public.friendships_guard_update() from public, anon, authenticated;
