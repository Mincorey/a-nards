-- =============================================================================
-- A-NARDS · Фаза 5 — Edge Function play-move вызывает finalize_game под
-- service_role. EXECUTE был отозван у public/anon/authenticated в 0003;
-- явно выдаём право service_role. Идемпотентно.
-- =============================================================================
grant execute on function public.finalize_game(uuid, char) to service_role;
