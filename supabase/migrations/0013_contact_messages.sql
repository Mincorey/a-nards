-- =============================================================================
-- A-NARDS · Контакты — журнал сообщений формы обратной связи + антиспам-лимит.
-- Пишет/читает только сервис-роль (Edge Function send-contact). RLS без политик
-- => анон/authenticated доступа нет; service_role обходит RLS. Идемпотентно.
-- =============================================================================
create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  topic       text not null,
  message     text not null,
  ip          text,
  user_agent  text,
  status      text not null default 'sent' check (status in ('sent', 'spam', 'error')),
  created_at  timestamptz not null default now()
);

-- Индекс для антиспам-лимита «сколько сообщений с этого IP за последний час».
create index if not exists idx_contact_ip_time on public.contact_messages (ip, created_at desc);
create index if not exists idx_contact_time    on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;
-- Политик нет намеренно: доступ только у service_role внутри Edge Function.
