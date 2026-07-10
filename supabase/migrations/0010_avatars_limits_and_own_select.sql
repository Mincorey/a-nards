-- =============================================================================
-- A-NARDS · Аудит M2 — Лимиты bucket аватаров + очистка старых файлов.
-- -----------------------------------------------------------------------------
-- 1) Ограничиваем размер и типы файлов на уровне bucket (серверный enforcement,
--    не обходится прямым API-запросом в свою папку).
-- 2) Добавляем УЗКУЮ SELECT-политику «только своя папка» — нужна клиенту, чтобы
--    перечислить (list) и удалить старые аватары. Это НЕ широкий листинг: видно
--    только файлы в <uid>/… самого пользователя. Публичное чтение аватаров идёт
--    по public-URL (bucket public=true) и этой политики не требует.
-- Идемпотентно.
-- =============================================================================

update storage.buckets
  set file_size_limit    = 5242880,  -- 5 МБ
      allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','image/avif']
  where id = 'avatars';

drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
