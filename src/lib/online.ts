/* =============================================================================
 * online.ts — Клиентский слой онлайна поверх Supabase.
 * Столы, места, активная партия, вызовы Edge Functions, подписки Realtime.
 * ========================================================================== */
import { supabase } from './supabase';
import type { GameRow, GameTable, TableSeat, Variant, Visibility } from './online.types';
import type { Move } from '../engine/types';
import type { ChatTransport, WireMessage } from '../game/chat';

export interface TableListItem extends GameTable {
  owner: { display_name: string; username: string } | null;
  seats: { count: number }[];
}

/** Открытые публичные столы в ожидании игроков. */
export async function listOpenTables(): Promise<TableListItem[]> {
  const { data, error } = await supabase
    .from('game_tables')
    .select('*, owner:profiles!owner_id(display_name, username), seats:table_seats(count)')
    .eq('status', 'waiting')
    .eq('visibility', 'public')
    .eq('quick', false)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as TableListItem[];
}

export interface CreateTableInput { name: string; variant: Variant; visibility: Visibility; quick?: boolean; }

/** Создать стол и сесть владельцем (место 0, белые). */
export async function createTable(input: CreateTableInput): Promise<GameTable> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('Не авторизован');

  const { data: table, error } = await supabase
    .from('game_tables')
    .insert({ owner_id: uid, name: input.name, variant: input.variant, visibility: input.visibility, quick: input.quick ?? false })
    .select().single();
  if (error) throw error;

  const { error: seatErr } = await supabase.from('table_seats')
    .insert({ table_id: table.id, user_id: uid, seat: 0, color: 'w', is_ready: true });
  if (seatErr) throw seatErr;

  return table as GameTable;
}

/**
 * Кандидаты для быстрого подбора: открытые БЫСТРЫЕ столы нужного варианта, где
 * сидит ровно один игрок (хозяин ждёт соперника) и это не мы. Отсортированы по
 * времени создания (сначала самые «старые» ожидающие — их и подхватываем).
 * Проверку присутствия хозяина (online) делает вызывающий компонент.
 */
export async function findQuickCandidates(variant: Variant): Promise<{ id: string; owner_id: string }[]> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id ?? null;
  const { data, error } = await supabase
    .from('game_tables')
    .select('id, owner_id, seats:table_seats(count)')
    .eq('status', 'waiting').eq('quick', true).eq('variant', variant)
    .order('created_at', { ascending: true }).limit(20);
  if (error) throw error;
  return (data ?? [])
    .filter((t) => (t as { owner_id: string }).owner_id !== uid
      && (((t as { seats?: { count: number }[] }).seats?.[0]?.count ?? 0) === 1))
    .map((t) => ({ id: (t as { id: string }).id, owner_id: (t as { owner_id: string }).owner_id }));
}

export interface TableFull {
  table: GameTable;
  seats: (TableSeat & { profile: { display_name: string; username: string; avatar_url: string | null; rating: number } | null })[];
}

export async function getTable(id: string): Promise<TableFull> {
  const { data: table, error } = await supabase.from('game_tables').select('*').eq('id', id).single();
  if (error) throw error;
  const { data: seats, error: se } = await supabase
    .from('table_seats')
    .select('*, profile:profiles!user_id(display_name, username, avatar_url, rating)')
    .eq('table_id', id)
    .order('seat');
  if (se) throw se;
  return { table: table as GameTable, seats: (seats ?? []) as TableFull['seats'] };
}

/** Сесть за стол на свободное место (вторым игроком — чёрные). */
export async function joinTable(id: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('Не авторизован');

  const { data: seats } = await supabase.from('table_seats').select('seat, color, user_id').eq('table_id', id);
  const list = seats ?? [];
  if (list.some((s) => s.user_id === uid)) return; // уже за столом
  if (list.length >= 2) throw new Error('Стол занят');

  const takenSeats = new Set(list.map((s) => s.seat));
  const seat = takenSeats.has(0) ? 1 : 0;
  const takenColors = new Set(list.map((s) => s.color));
  const color = takenColors.has('w') ? 'b' : 'w';

  const { error } = await supabase.from('table_seats')
    .insert({ table_id: id, user_id: uid, seat, color, is_ready: true });
  if (error) throw error;
}

export async function leaveTable(id: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;
  await supabase.from('table_seats').delete().eq('table_id', id).eq('user_id', uid);
}

export async function setReady(id: string, ready: boolean): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;
  await supabase.from('table_seats').update({ is_ready: ready }).eq('table_id', id).eq('user_id', uid);
}

export interface LeaderboardRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  rating: number;
  games_played: number;
  games_won: number;
}

/** Таблица лидеров: все игроки по убыванию рейтинга (для страницы «Рейтинги»). */
export async function fetchLeaderboard(limit = 200): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, rating, games_played, games_won')
    .order('rating', { ascending: false })
    .order('games_won', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LeaderboardRow[];
}

/** Текущий рейтинг авторизованного игрока (для показа прироста после победы). */
export async function fetchMyRating(): Promise<number | null> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return null;
  const { data } = await supabase.from('profiles').select('rating').eq('id', uid).maybeSingle();
  return (data?.rating as number | undefined) ?? null;
}

export async function getActiveGame(tableId: string): Promise<GameRow | null> {
  const { data } = await supabase.from('games')
    .select('*').eq('table_id', tableId).order('started_at', { ascending: false }).limit(1).maybeSingle();
  return (data as GameRow) ?? null;
}

/** Edge Functions (авторитет сервера). */
async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const ctx = (error as { context?: { body?: unknown } }).context;
    const msg = (data as { error?: string } | null)?.error
      || (typeof ctx?.body === 'string' ? ctx.body : '')
      || error.message;
    throw new Error(msg);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export const startGame = (table_id: string) => invoke<{ game: GameRow }>('start-game', { table_id });
export const rollDice = (game_id: string) => invoke<{ game: GameRow }>('roll-dice', { game_id });
export const playMove = (game_id: string, move: Move) => invoke<{ game: GameRow }>('play-move', { game_id, move });
/** Пропустить ход, когда у ходящего нет доступных ходов (после показа костей). */
export const passTurn = (game_id: string) => invoke<{ game: GameRow }>('pass-turn', { game_id });

/** Подписка на изменения стола: места, статус стола, партия. topic разводит каналы. */
export function subscribeTable(
  tableId: string,
  handlers: { onSeats?: () => void; onTable?: () => void; onGame?: (g: GameRow) => void },
  topic = 'main',
) {
  const ch = supabase
    .channel(`table:${tableId}:${topic}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'table_seats', filter: `table_id=eq.${tableId}` },
      () => handlers.onSeats?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_tables', filter: `id=eq.${tableId}` },
      () => handlers.onTable?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `table_id=eq.${tableId}` },
      (payload) => handlers.onGame?.(payload.new as GameRow))
    .subscribe();
  return () => { void supabase.removeChannel(ch); };
}

/**
 * Онлайн-чат стола поверх Supabase Realtime broadcast. Фразы НЕ пишутся в БД
 * (эфемерные) — рассылаются подписчикам канала. self:false, поэтому отправитель
 * не получает собственное сообщение обратно (своё он уже показал локально).
 * Канал создаётся лениво при первой подписке и закрывается при отписке.
 */
export function createChatChannel(tableId: string): ChatTransport {
  let ch: ReturnType<typeof supabase.channel> | null = null;
  let handler: ((m: WireMessage) => void) | null = null;

  const ensure = () => {
    if (ch) return ch;
    ch = supabase.channel(`chat:${tableId}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'msg' }, (p: { payload: WireMessage }) => handler?.(p.payload));
    ch.subscribe();
    return ch;
  };

  return {
    send: (m) => { void ensure().send({ type: 'broadcast', event: 'msg', payload: m }); },
    subscribe: (cb) => {
      handler = cb;
      ensure();
      return () => {
        handler = null;
        if (ch) { void supabase.removeChannel(ch); ch = null; }
      };
    },
  };
}

/**
 * Быстрая синхронизация состояния партии поверх Supabase Realtime broadcast.
 * После своего успешного хода/броска игрок рассылает новую строку партии
 * сопернику — тот применяет её почти мгновенно (<100 мс), не дожидаясь
 * postgres_changes (репликация WAL медленнее). postgres_changes при этом
 * ОСТАЁТСЯ как надёжный запасной канал сверки: дубликат отсеивается по
 * updated_at на приёмнике. self:false — своё сообщение обратно не приходит
 * (у отправителя уже есть авторитетное состояние от Edge Function).
 */
export interface GameSyncTransport {
  send: (row: GameRow) => void;
  subscribe: (cb: (row: GameRow) => void) => () => void;
}

export function createGameSync(tableId: string): GameSyncTransport {
  let ch: ReturnType<typeof supabase.channel> | null = null;
  let handler: ((row: GameRow) => void) | null = null;

  const ensure = () => {
    if (ch) return ch;
    ch = supabase.channel(`table:${tableId}:sync`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'game' }, (p: { payload: GameRow }) => handler?.(p.payload));
    ch.subscribe();
    return ch;
  };

  return {
    send: (row) => { void ensure().send({ type: 'broadcast', event: 'game', payload: row }); },
    subscribe: (cb) => {
      handler = cb;
      ensure();
      return () => {
        handler = null;
        if (ch) { void supabase.removeChannel(ch); ch = null; }
      };
    },
  };
}

/** Подписка на список открытых столов (любые изменения game_tables). */
export function subscribeLobby(onChange: () => void) {
  const ch = supabase
    .channel('lobby')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_tables' }, () => onChange())
    .subscribe();
  return () => { void supabase.removeChannel(ch); };
}

/** Сдаться / выйти из партии во время игры — поражение вышедшему (edge resign). */
export const resignGame = (game_id: string) =>
  invoke<{ ok: boolean; winner: 'w' | 'b' | null }>('resign', { game_id });

/** Засчитать сопернику таймаут хода (edge claim-timeout; сервер проверит 90с). */
export const claimTimeout = (game_id: string) =>
  invoke<{ ok: boolean; winner: 'w' | 'b' | null }>('claim-timeout', { game_id });

/** Удалить стол (только владелец, по RLS). Каскад уберёт места и партии. */
export async function deleteTable(id: string): Promise<void> {
  await supabase.from('game_tables').delete().eq('id', id);
}
