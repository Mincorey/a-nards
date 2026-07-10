-- Баг: gt_select использовал private.can_see_table(id), которая делает
-- `select 1 from public.game_tables where id = tid ...` — саб-запрос к ТОЙ ЖЕ таблице.
-- При INSERT ... RETURNING (именно так supabase-js делает .insert().select()) строка,
-- которую мы только что вставляем, ещё не видна отдельному под-запросу в рамках той же
-- команды (правило видимости Postgres — не видишь свою же незакоммиченную команду).
-- В итоге can_see_table(id) для новой строки всегда возвращала false, и RLS блокировала
-- RETURNING с ошибкой "new row violates row-level security policy" — стол физически
-- НЕ создавался (транзакция insert+returning откатывается целиком при ошибке), и клиент
-- получал 403 при любой попытке создать стол.
--
-- Исправление: проверяем колонки СТРОКИ напрямую (owner_id, visibility), без обращения
-- к таблице через под-запрос к ней самой. Для "есть место за столом" — под-запрос к ДРУГОЙ
-- таблице (table_seats), которая этой проблеме не подвержена (строка в game_tables к
-- моменту вставки в table_seats уже закоммичена отдельной командой).
--
-- Протестировано в rollback-транзакции перед применением: создание стола (публичного и
-- приватного) проходит; посторонний пользователь по-прежнему не видит чужой приватный стол.
drop policy if exists gt_select on public.game_tables;
create policy gt_select on public.game_tables
  for select
  using (
    visibility = 'public'
    or owner_id = auth.uid()
    or exists (
      select 1 from public.table_seats s
      where s.table_id = game_tables.id and s.user_id = auth.uid()
    )
  );
