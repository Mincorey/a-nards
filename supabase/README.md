# Supabase — настройка для A-NARDS (Фаза 4)

## 1. Миграции БД — УЖЕ ПРИМЕНЕНЫ ✅ (2026-06-28)

Миграции `migrations/0001_profiles.sql` и `migrations/0002_security_hardening.sql`
применены к проекту A-NARDS (`wiwfzmwzkjmluhnrrcnh`) через коннектор. Security-advisor —
**без замечаний**. Файлы хранятся как история/для повторного развёртывания
(идемпотентны — повторный запуск в SQL Editor безопасен).

Что создано:

- таблица `public.profiles` (username, display_name, avatar_url, rating, games_played, games_won);
- триггер `on_auth_user_created` — профиль создаётся автоматически при регистрации;
- RLS: профили читают все, изменяет только владелец;
- Storage-bucket `avatars` (чтение по публичному URL, запись только в свою папку `<uid>/…`;
  широкая SELECT-политика намеренно не создаётся — иначе возможен листинг всех файлов).

## 2. Отключить подтверждение email (режим разработки)

Authentication → **Sign In / Providers** → **Email** → выключить **Confirm email** → Save.
После этого регистрация сразу даёт сессию (вход без письма со ссылкой).

> Интерфейс поддерживает оба режима: если подтверждение включено, после регистрации
> покажем сообщение «проверьте почту».

## 3. (Опционально) Восстановление пароля

Для писем восстановления настрой **Authentication → URL Configuration → Site URL**
на адрес приложения (для локали — `http://localhost:5173`), чтобы ссылка из письма
вела обратно в приложение.

## 4. Паритет движка клиент↔сервер (аудит M1)

Правила игры существуют в двух местах: канонично в `src/engine/*` + `src/game/rules.ts`
(клиент) и как Deno-копии в `supabase/functions/_shared/*` (сервер). Копии
**генерируются**, не редактируются вручную:

```
npm run sync:engine     # перегенерировать _shared из src/engine (+ удалить устаревший engine.ts)
npm run check:engine    # проверить синхрон (exit 1 при расхождении) — для CI/предеплоя
```

Расхождение также ловит тест `src/engine/serverParity.test.ts` (в `npm test`).

**Перед `supabase functions deploy` (roll-dice/start-game/play-move) выполняйте
`npm run sync:engine`**, иначе на сервер уедет устаревшая копия правил.
