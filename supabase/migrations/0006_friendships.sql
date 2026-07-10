-- =============================================================================
-- A-NARDS · Фаза 7 — Дружба: заявки и принятые связи. RLS + Realtime.
-- (Приглашения за стол используют таблицу invites из 0003.) Идемпотентно.
-- =============================================================================

create table if not exists public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles (id) on delete cascade,
  addressee_id  uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint friendship_not_self check (requester_id <> addressee_id)
);

-- Одна связь на пару (в любом направлении).
create unique index if not exists uniq_friendship_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

drop trigger if exists trg_friendships_updated_at on public.friendships;
create trigger trg_friendships_updated_at
  before update on public.friendships
  for each row execute function public.touch_updated_at();

alter table public.friendships enable row level security;

drop policy if exists "fr_select" on public.friendships;
create policy "fr_select" on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "fr_insert" on public.friendships;
create policy "fr_insert" on public.friendships for insert
  with check (auth.uid() = requester_id and requester_id <> addressee_id);

drop policy if exists "fr_update" on public.friendships;
create policy "fr_update" on public.friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "fr_delete" on public.friendships;
create policy "fr_delete" on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.friendships'; exception when duplicate_object then null; end;
end $$;
