-- =============================================================================
-- A-NARDS · Гигиена онлайна: авто-уборка брошенных столов и зависших партий.
-- cleanup_online() вызывается по расписанию pg_cron раз в минуту. Идемпотентно.
-- Автопоражение живому сопернику засчитывает edge-функция claim-timeout (90с),
-- здесь же — только страховочная уборка «зомби», когда ушли ОБА игрока
-- (закрываем партию БЕЗ начисления рейтинга) и удаление старых столов.
-- =============================================================================

create or replace function public.cleanup_online()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1) Брошенные ожидающие столы: без мест ИЛИ старше 30 минут → удалить
  --    (каскад уберёт места и инвайты).
  delete from public.game_tables t
   where t.status = 'waiting'
     and (
       not exists (select 1 from public.table_seats s where s.table_id = t.id)
       or t.created_at < now() - interval '30 minutes'
     );

  -- 2) Зависшие партии: никто не ходил > 10 минут → закрыть БЕЗ победителя
  --    (рейтинг не трогаем — это не честная победа, а уборка зомби).
  update public.games
     set status = 'finished', ended_at = now()
   where status = 'playing'
     and updated_at < now() - interval '10 minutes';

  update public.game_tables t
     set status = 'finished'
   where t.status = 'playing'
     and exists (select 1 from public.games g where g.table_id = t.id and g.status = 'finished');

  -- 3) Завершённые столы старше часа → удалить целиком (каскад партий/мест).
  delete from public.game_tables
   where status = 'finished' and created_at < now() - interval '1 hour';
end;
$$;

revoke execute on function public.cleanup_online() from public, anon, authenticated;

-- Планировщик: раз в минуту. Пере-создаём идемпотентно.
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('anards-cleanup');
exception when others then
  null; -- задачи ещё нет — ок
end;
$$;

select cron.schedule('anards-cleanup', '* * * * *', $$ select public.cleanup_online(); $$);
