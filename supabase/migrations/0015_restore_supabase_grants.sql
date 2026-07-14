-- =============================================================================
-- A-NARDS · Восстановление стандартных грантов Supabase для ролей API.
-- -----------------------------------------------------------------------------
-- При создании таблиц на новом проекте (Франкфурт) через management API дефолтные
-- грант-права anon/authenticated/service_role НЕ применились — у ролей остались лишь
-- REFERENCES/TRIGGER/TRUNCATE, но не SELECT/INSERT/UPDATE/DELETE. Из-за этого клиент
-- получал бы "permission denied" ещё до проверки RLS. RLS включён на всех таблицах и
-- продолжает ограничивать реальный доступ — гранты лишь открывают роли «дверь», а
-- политики решают, что именно видно/можно. Идемпотентно.
-- =============================================================================
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
