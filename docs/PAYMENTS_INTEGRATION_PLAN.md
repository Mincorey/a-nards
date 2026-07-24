# Приём платежей за A-COINS — технический план

*Дата: 2026-07-20. Статус: проект, к коду НЕ применялся.*
*Модель: закрытая экономика — A-COINS покупаются, вывода нет (решение Олега 2026-07-20).*
*Провайдер: А-Мобайл.касса (см. `PAYMENTS_RESEARCH.md`, раздел 17). Спроектировано
так, чтобы провайдер был заменяем — детали API вынесены в один адаптер.*

---

## 0. Принципы

1. **Деньги считает только сервер.** Клиент никогда не сообщает сумму и не начисляет
   монеты. Цена берётся из справочника пакетов на сервере по `package_id`.
2. **Реестр — источник истины.** Баланс не «редактируется», а выводится из
   append-only реестра операций. Колонка баланса — денормализованный кэш,
   меняется только вместе с записью в реестр, в одной транзакции.
3. **Идемпотентность обязательна.** Вебхук провайдера может прийти дважды, трижды,
   с задержкой. Повторная доставка не должна начислить монеты дважды.
4. **Возврат на сайт ничего не подтверждает.** Статус оплаты берётся ТОЛЬКО из
   вебхука/сверки с провайдером. Redirect после оплаты — лишь UX.
5. **Целые числа.** Рубли храним в копейках (`integer`), монеты — целые. Никаких float.

---

## 1. Схема БД (миграция `0023_payments_wallet.sql`)

### 1.1. Баланс игрока

```sql
alter table public.profiles
  add column if not exists coins bigint not null default 0
    constraint coins_non_negative check (coins >= 0);
```

Баланс лежит в профиле (уже читается клиентом, RLS настроен). Прямой UPDATE
клиентом запрещаем — политика на profiles должна исключать колонку `coins`
(проверить текущую политику update: если она разрешает обновление всей строки,
переписать на явный список колонок через триггер-guard).

### 1.2. Справочник пакетов

```sql
create table if not exists public.coin_packages (
  id          text primary key,              -- 'p100', 'p500', ...
  title       text    not null,              -- «100 A-COINS»
  coins       bigint  not null check (coins > 0),
  price_kop   integer not null check (price_kop > 0),  -- цена в копейках
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
```

RLS: `select` разрешён всем (витрина должна быть видна и без регистрации —
требование модерации платёжных сервисов). Запись — только service_role.

### 1.3. Платежи (инвойсы)

```sql
create type payment_status as enum ('pending','paid','failed','expired','refunded');

create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  package_id     text not null references public.coin_packages(id),
  coins          bigint  not null,   -- зафиксировано в момент создания
  amount_kop     integer not null,   -- зафиксировано в момент создания
  status         payment_status not null default 'pending',
  provider       text not null default 'amobile',
  provider_ref   text,               -- id инвойса на стороне провайдера
  payment_url    text,               -- ссылка/QR для оплаты
  raw_callback   jsonb,              -- сырой ответ провайдера (для разбора споров)
  created_at     timestamptz not null default now(),
  paid_at        timestamptz,
  expires_at     timestamptz not null default now() + interval '30 minutes',
  constraint provider_ref_unique unique (provider, provider_ref)
);

create index on public.payments (user_id, created_at desc);
create index on public.payments (status) where status = 'pending';
```

`unique (provider, provider_ref)` — первая линия защиты от двойного начисления.

RLS: игрок видит только свои платежи (`select using (user_id = auth.uid())`).
Insert/update — только service_role (через Edge Function).

### 1.4. Реестр операций с монетами

```sql
create table if not exists public.coin_ledger (
  id             bigserial primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  delta          bigint not null check (delta <> 0),
  reason         text   not null,   -- 'purchase'|'table_entry'|'table_prize'|'refund'|'admin'
  balance_after  bigint not null,
  payment_id     uuid references public.payments(id),
  table_id       uuid references public.game_tables(id),
  note           text,
  created_at     timestamptz not null default now()
);

create index on public.coin_ledger (user_id, created_at desc);
create unique index if not exists ledger_one_credit_per_payment
  on public.coin_ledger (payment_id) where payment_id is not null;
```

Последний индекс — вторая линия защиты: на один платёж физически невозможно
записать два начисления.

RLS: игрок читает свои записи. Запись — только через функции ниже.

### 1.5. Функция начисления (единственная точка изменения баланса)

```sql
create or replace function public.credit_coins_for_payment(p_payment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid; v_coins bigint; v_balance bigint;
begin
  -- Блокируем строку платежа: параллельные вебхуки встанут в очередь.
  select user_id, coins into v_user, v_coins
  from public.payments where id = p_payment and status = 'pending'
  for update;

  if not found then
    return;  -- уже обработан или не существует — идемпотентный выход
  end if;

  update public.profiles set coins = coins + v_coins
  where id = v_user returning coins into v_balance;

  insert into public.coin_ledger (user_id, delta, reason, balance_after, payment_id)
  values (v_user, v_coins, 'purchase', v_balance, p_payment);

  update public.payments
  set status = 'paid', paid_at = now() where id = p_payment;
end; $$;

revoke execute on function public.credit_coins_for_payment(uuid) from public, anon, authenticated;
```

Вызывать может только service_role (Edge Function). `for update` + условие
`status='pending'` дают идемпотентность даже при одновременных доставках вебхука.

---

## 2. Edge Functions

### 2.1. `create-payment`

Вход: `{ package_id }`. Авторизация — JWT игрока (как в существующих функциях).

Шаги:
1. Достать пакет из `coin_packages` (только `is_active`). Нет — 400.
2. Антиспам: не больше N (например 5) `pending`-платежей на игрока за 10 минут.
3. Вставить строку `payments` со статусом `pending`, зафиксировав `coins`
   и `amount_kop` из справочника (**не из запроса клиента**).
4. Вызвать API А-Мобайл: создать инвойс на `amount_kop`, передать
   `callback_url` (вебхук) и `return_url`, в описании — «Доступ к дополнительным
   функциям игры A-NARDS», в метаданные — наш `payments.id`.
5. Сохранить `provider_ref` и `payment_url`, вернуть клиенту `payment_url`
   (или данные QR).

*Точный формат запроса — по документации А-Мобайл, которой пока нет (вопрос 2 в
разделе 17.4 исследования). Вся провайдер-специфика изолируется в
`supabase/functions/_shared/amobile.ts`, чтобы смена провайдера не задела логику.*

### 2.2. `payment-webhook`

Публичная функция (без JWT — вызывает провайдер), но:

1. **Проверка подписи.** HMAC/секрет из env (`AMOBILE_WEBHOOK_SECRET`), сверка
   с заголовком провайдера. Не сошлось — 401 и запись в лог. *Механизм уточнить
   у А-Мобайл; если подписи нет — обязательна серверная сверка (п. 2.3).*
2. Найти платёж по `provider_ref`. Нет — 404.
3. **Сверить сумму** из колбэка с `payments.amount_kop`. Расхождение — не начислять,
   пометить `failed`, залогировать.
4. Сохранить `raw_callback`.
5. Успех → `credit_coins_for_payment(payment_id)`. Отказ → `status='failed'`.
6. Вернуть 200 (иначе провайдер будет ретраить бесконечно).

### 2.3. `reconcile-payments` (по расписанию, раз в 10–15 минут)

Страховка на случай потерянного вебхука: берёт `pending`-платежи старше 5 минут,
опрашивает статус у провайдера, доначисляет через ту же функцию; просроченные
(`expires_at < now()`) переводит в `expired`. Без этого при сбое вебхука игрок
заплатит и не получит монеты — самый болезненный класс инцидентов.

---

## 3. Клиент

- `src/lib/wallet.ts` — заменить заглушку `WALLET_BALANCE_RUB` на чтение
  `profiles.coins` (+ подписка на Realtime, чтобы баланс обновился сам после оплаты).
- Новый экран/модалка «Купить A-COINS»: карточки пакетов из `coin_packages`,
  кнопка → `create-payment` → редирект на `payment_url` (или показ QR).
- `/payment/return` — страница ожидания: опрашивает свой платёж по id
  (или слушает Realtime по строке `payments`), показывает «Оплата обрабатывается…»
  → «Зачислено N A-COINS» → или «Не удалось». **Статус только из БД.**
- `ProfilePage` — история операций из `coin_ledger` (покупки, входы за столы, призы).
- Витрина пакетов должна открываться без регистрации (требование модерации).

---

## 4. Правки текстов (обязательны до подачи на модерацию)

Актуально и для А-Мобайл. Подробный чек-лист — `PAYMENTS_RESEARCH.md`, раздел 14.3.
Коротко:

- `ContactsPage.tsx:15` — убрать тему «Проблема с выводом средств».
- `ProfilePage` — убрать кнопку/упоминания вывода; подсказку у телефона
  переформулировать («для восстановления доступа»).
- `LobbyPage` — «Ставка входа» → «Взнос за стол»; убрать «1 ₽ = 1 A-COIN»;
  «победитель забирает банк» → «взносы объединяются в приз стола в A-COINS».
- Новые страницы: «Оплата и возврат», публичная оферта (A-COINS — внутриигровые
  условные единицы, не деньги, обратному обмену не подлежат).
- Футер: реквизиты юрлица (наименование, ИНН, адрес), телефон, email.

---

## 5. Тесты (до применения к проекту)

**Обязательные к прогону, по правилу проекта «сначала тесты, потом применение»:**

1. Идемпотентность вебхука: один и тот же колбэк 3 раза подряд → монеты начислены
   ровно один раз (проверка по `coin_ledger`).
2. Параллельная доставка: два вебхука одновременно → одно начисление
   (проверяет `for update`).
3. Подмена суммы: колбэк с суммой меньше `amount_kop` → начисления нет, `failed`.
4. Подмена пакета на клиенте: запрос с чужой/несуществующей ценой → сервер берёт
   свою цену из справочника.
5. Целостность реестра: `profiles.coins == sum(coin_ledger.delta)` для каждого
   игрока после серии случайных операций.
6. Неверная подпись вебхука → 401, ничего не начислено.
7. Просрочка: `pending` старше `expires_at` → `expired`, начисления нет.
8. RLS: игрок не видит чужие платежи и чужой реестр; не может изменить свой баланс
   прямым UPDATE.

---

## 6. Порядок реализации

| Шаг | Что | Блокируется чем |
|---|---|---|
| 1 | Запрос в А-Мобайл (см. приложение) | — |
| 2 | Правки текстов (раздел 4) | — |
| 3 | Миграция БД + функция начисления + тесты RLS/реестра | — |
| 4 | Экран покупки на моках (без реального API) | шаг 3 |
| 5 | Адаптер `_shared/amobile.ts` + `create-payment` + вебхук | ответ А-Мобайл |
| 6 | `reconcile-payments` по расписанию | шаг 5 |
| 7 | Боевой прогон на минимальной сумме | юрлицо + счёт |

Шаги 2–4 можно делать **сразу** — они не зависят от ответа провайдера.

---

## Приложение. Текст запроса в А-Мобайл

> Здравствуйте!
>
> Планирую подключить онлайн-эквайринг для сайта онлайн-игры в нарды собственной
> разработки (A-NARDS). Прежде чем регистрировать юридическое лицо и открывать счёт,
> хочу убедиться, что сервис подходит под мой случай.
>
> **О проекте.** Веб-игра в нарды. Монетизация — продажа внутриигровых условных
> единиц (A-COINS) и премиум-функций: оформление доски, снятие рекламы, подписка.
> A-COINS расходуются только внутри игры, обратному обмену на деньги не подлежат,
> вывода средств в проекте нет. По сути — продажа доступа к дополнительным функциям
> собственного ПО. Типичный платёж 100–1000 ₽, платежей много и они мелкие.
> Основная аудитория — пользователи из России.
>
> **Вопросы:**
>
> 1. Проходят ли у вас карты МИР российских банков? Какой примерно процент отказов
>    по картам РФ? Для меня это критично — аудитория российская.
> 2. Есть ли документация по REST API: создание платежа, проверка статуса, коды ошибок?
> 3. Как приходит подтверждение оплаты — webhook на мой адрес? Как он подписывается
>    и делаете ли вы повторные доставки при недоступности моего сервера?
> 4. Есть ли тестовый контур (sandbox) для интеграции до боевого запуска?
> 5. Возможны ли возвраты (refund) через API?
> 6. Нужны ли чеки покупателям и кто их формирует?
> 7. Какие лимиты по сумме операции, в сутки и в месяц?
> 8. Какая точная комиссия для профиля «много мелких платежей»?
> 9. Какой вид деятельности указывать при подключении и пропустите ли вы
>    формулировку «предоставление доступа к дополнительным функциям онлайн-игры
>    собственной разработки»?
> 10. Что требуется от юридического лица: ИП или ООО, какой пакет документов,
>     сроки открытия расчётного счёта в Универсал Банке?
>
> Заранее спасибо за ответ.

