# A-NARDS — нарды онлайн

Веб-игра в нарды (классические короткие и длинные) с ботом и онлайн-режимом.
Стек: **React + Vite + TypeScript + Supabase**. Деплой: **Vercel**.

## Запуск локально (Windows)

```bash
npm install        # установить зависимости (нужен Node 18+; рекомендуется 20/22)
npm run dev        # дев-сервер: http://localhost:5173
```

> `node_modules` платформозависимы — устанавливайте их на своей машине, в репозиторий они не попадают (`.gitignore`).

## Команды

| Команда | Действие |
|---|---|
| `npm run dev` | дев-сервер с hot-reload |
| `npm run build` | прод-сборка в `dist/` (проверка типов + Vite) |
| `npm run preview` | предпросмотр прод-сборки |
| `npm run lint` | проверка ESLint |
| `npm test` | юнит-тесты (vitest) |

## Переменные окружения

Скопируйте `.env.example` → `.env.local` и заполните:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...     # anon / publishable ключ — безопасен для фронта
```

⚠️ **service_role** ключ Supabase НИКОГДА не кладётся во фронт и не коммитится —
только в Edge Functions (серверные секреты).

## Структура

```
A-NARDS/
├─ assets/          исходные ассеты (доска, фишки, кубик)
├─ engine/          движок правил (nardy-engine.js) — короткие нарды
├─ public/assets/   ассеты, отдаваемые фронтом
├─ src/
│  ├─ pages/        экраны (Home, Play, Lobby, Profile, Auth)
│  ├─ components/   переиспользуемые компоненты
│  ├─ engine/       (Фаза 1) движок на TS
│  ├─ lib/          supabase-клиент
│  └─ styles/       стили
├─ PLAN.md          пошаговый план разработки
└─ chat_list.md     память между сессиями
```

См. **PLAN.md** — полная дорожная карта (фазы 0–10).
