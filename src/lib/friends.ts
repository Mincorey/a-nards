/* =============================================================================
 * friends.ts — Друзья (заявки/принятые) и приглашения за стол.
 * ========================================================================== */
import { supabase } from './supabase';
import { joinTable } from './online';

export interface MiniProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  rating: number;
}

export interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  requester: MiniProfile | null;
  addressee: MiniProfile | null;
}

export interface FriendsBuckets {
  friends: { id: string; profile: MiniProfile }[];     // принятые (id = friendship id)
  incoming: { id: string; profile: MiniProfile }[];    // входящие заявки
  outgoing: { id: string; profile: MiniProfile }[];    // исходящие заявки
}

async function myId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('Не авторизован');
  return id;
}

const SEL = 'id, username, display_name, avatar_url, rating';

/** Поиск игроков по username/имени (кроме себя). */
export async function searchUsers(q: string): Promise<MiniProfile[]> {
  // Санитизация (аудит H3): оставляем только буквы/цифры/пробел/подчёркивание/дефис.
  // Так вырезаются структурные символы PostgREST-фильтра ( , ( ) . * % ), которые
  // иначе позволяли бы инъекцию в строку .or(...). В шаблоне .or() wildcard PostgREST —
  // это '*', а не '%' (прежний '%' воспринимался буквально и ломал поиск).
  const term = q.trim().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 30);
  if (term.length < 2) return [];
  const me = await myId();
  const { data, error } = await supabase
    .from('profiles')
    .select(SEL)
    .or(`username.ilike.${term}*,display_name.ilike.*${term}*`)
    .neq('id', me)
    .limit(10);
  if (error) throw error;
  return (data ?? []) as MiniProfile[];
}

export async function sendFriendRequest(addresseeId: string): Promise<void> {
  const me = await myId();
  // Если есть встречная заявка — принимаем её.
  const { data: reverse } = await supabase.from('friendships')
    .select('id, status').eq('requester_id', addresseeId).eq('addressee_id', me).maybeSingle();
  if (reverse) {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', reverse.id);
    return;
  }
  const { error } = await supabase.from('friendships')
    .insert({ requester_id: me, addressee_id: addresseeId, status: 'pending' });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error('Заявка уже существует');
    throw error;
  }
}

export async function getFriends(): Promise<FriendsBuckets> {
  const me = await myId();
  const { data, error } = await supabase
    .from('friendships')
    .select(`id, requester_id, addressee_id, status,
             requester:profiles!requester_id(${SEL}),
             addressee:profiles!addressee_id(${SEL})`)
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
  if (error) throw error;
  const rows = (data ?? []) as unknown as FriendshipRow[];
  const buckets: FriendsBuckets = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const other = r.requester_id === me ? r.addressee : r.requester;
    if (!other) continue;
    if (r.status === 'accepted') buckets.friends.push({ id: r.id, profile: other });
    else if (r.status === 'pending') {
      if (r.addressee_id === me) buckets.incoming.push({ id: r.id, profile: other });
      else buckets.outgoing.push({ id: r.id, profile: other });
    }
  }
  return buckets;
}

export const acceptRequest = async (id: string) =>
  void (await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id));

export const removeFriendship = async (id: string) =>
  void (await supabase.from('friendships').delete().eq('id', id));

/* ----------------------------- Приглашения за стол ----------------------- */

export interface InviteRow {
  id: string;
  table_id: string;
  from_id: string;
  status: 'pending' | 'accepted' | 'declined';
  from: MiniProfile | null;
  table: { name: string; variant: string; status: string } | null;
}

export async function createInvite(tableId: string, toId: string): Promise<void> {
  const me = await myId();
  const { error } = await supabase.from('invites')
    .upsert({ table_id: tableId, from_id: me, to_id: toId, status: 'pending' },
      { onConflict: 'table_id,to_id' });
  if (error) throw error;
}

export async function getIncomingInvites(): Promise<InviteRow[]> {
  const me = await myId();
  const { data, error } = await supabase
    .from('invites')
    .select(`id, table_id, from_id, status,
             from:profiles!from_id(${SEL}),
             table:game_tables!table_id(name, variant, status)`)
    .eq('to_id', me).eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as InviteRow[];
}

/** Принять приглашение: сесть за стол и пометить инвайт. */
export async function acceptInvite(inv: InviteRow): Promise<string> {
  await joinTable(inv.table_id);
  await supabase.from('invites').update({ status: 'accepted' }).eq('id', inv.id);
  return inv.table_id;
}

export const declineInvite = async (id: string) =>
  void (await supabase.from('invites').update({ status: 'declined' }).eq('id', id));

/* ----------------------------- Realtime ---------------------------------- */

export function subscribeSocial(me: string, onChange: () => void) {
  const ch = supabase
    .channel(`social:${me}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invites', filter: `to_id=eq.${me}` },
      () => onChange())
    .subscribe();
  return () => { void supabase.removeChannel(ch); };
}
