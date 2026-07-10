import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useOnline } from '../lib/presence';
import { useSocialNotifications } from '../lib/socialNotifications';
import {
  searchUsers, sendFriendRequest, getFriends, acceptRequest, removeFriendship,
  type MiniProfile, type FriendsBuckets,
} from '../lib/friends';

function Dot({ online }: { online: boolean }) {
  return <span className={'fr-dot' + (online ? ' is-on' : '')} title={online ? 'В сети' : 'Не в сети'} />;
}

export default function FriendsPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const { isOnline } = useOnline();
  // Список друзей/заявок этой странице нужен полнее, чем даёт общий контекст
  // уведомлений (там только счётчик + инвайты) — поэтому свой fetch остаётся,
  // но Realtime-подписка ОДНА на всё приложение (см. SocialNotificationsProvider
  // в main.tsx) — здесь просто реагируем на её version, не открывая свой канал
  // (иначе Supabase Realtime ругается «cannot add postgres_changes callbacks
  // ... after subscribe()», см. chat_list.md — Session 5).
  const { version } = useSocialNotifications();
  const [buckets, setBuckets] = useState<FriendsBuckets>({ friends: [], incoming: [], outgoing: [] });
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MiniProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(() => {
    getFriends().then(setBuckets).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, []);

  useEffect(() => {
    if (!auth.user) return;
    reload();
  }, [auth.user, reload, version]);

  if (!auth.ready) return <section className="friends"><div className="card"><p>Загрузка…</p></div></section>;
  if (!auth.user) {
    return (
      <section className="friends"><div className="card">
        <h1>Друзья</h1><p>Войдите, чтобы добавлять друзей и звать их за стол.</p>
        <button className="btn btn--primary" onClick={() => nav('/auth')}>Войти</button>
      </div></section>
    );
  }

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNote(null);
    try { setResults(await searchUsers(q)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ошибка поиска'); }
  }

  async function add(id: string) {
    setBusy(true); setError(null); setNote(null);
    try { await sendFriendRequest(id); setNote('Заявка отправлена'); setResults([]); setQ(''); reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось'); }
    finally { setBusy(false); }
  }

  const knownIds = new Set([
    ...buckets.friends.map((f) => f.profile.id),
    ...buckets.incoming.map((f) => f.profile.id),
    ...buckets.outgoing.map((f) => f.profile.id),
  ]);

  return (
    <section className="friends">
      <h1 className="friends__title">Друзья</h1>
      {error && <p className="auth__error" role="alert">{error}</p>}
      {note && <p className="auth__info">{note}</p>}

      <form className="card friends__search" onSubmit={doSearch}>
        <label className="field">
          <span>Найти игрока по нику или имени</span>
          <div className="friends__search-row">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="например: Настя или nastya92" />
            <button className="btn btn--primary" type="submit">Искать</button>
          </div>
        </label>
        {results.length > 0 && (
          <div className="friends__results">
            {results.map((p) => (
              <div key={p.id} className="fr-row">
                <Dot online={isOnline(p.id)} />
                <div className="fr-row__id"><strong>{p.display_name}</strong><span>@{p.username} · {p.rating}</span></div>
                <button className="btn" disabled={busy || knownIds.has(p.id)} onClick={() => add(p.id)}>
                  {knownIds.has(p.id) ? 'Уже добавлен' : 'Добавить'}
                </button>
              </div>
            ))}
          </div>
        )}
      </form>

      {buckets.incoming.length > 0 && (
        <div className="card friends__block">
          <h2>Входящие заявки</h2>
          {buckets.incoming.map((f) => (
            <div key={f.id} className="fr-row">
              <Dot online={isOnline(f.profile.id)} />
              <div className="fr-row__id"><strong>{f.profile.display_name}</strong><span>@{f.profile.username}</span></div>
              <div className="fr-row__actions">
                <button className="btn btn--primary" onClick={() => acceptRequest(f.id).then(reload)}>Принять</button>
                <button className="btn" onClick={() => removeFriendship(f.id).then(reload)}>Отклонить</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card friends__block">
        <h2>Мои друзья ({buckets.friends.length})</h2>
        {buckets.friends.length === 0 ? (
          <p className="lobby__empty">Пока никого. Найдите игроков выше.</p>
        ) : (
          buckets.friends.map((f) => (
            <div key={f.id} className="fr-row">
              <Dot online={isOnline(f.profile.id)} />
              <div className="fr-row__id"><strong>{f.profile.display_name}</strong><span>@{f.profile.username} · {f.profile.rating}</span></div>
              <button className="btn" onClick={() => removeFriendship(f.id).then(reload)}>Удалить</button>
            </div>
          ))
        )}
      </div>

      {buckets.outgoing.length > 0 && (
        <div className="card friends__block">
          <h2>Отправленные заявки</h2>
          {buckets.outgoing.map((f) => (
            <div key={f.id} className="fr-row">
              <Dot online={isOnline(f.profile.id)} />
              <div className="fr-row__id"><strong>{f.profile.display_name}</strong><span>@{f.profile.username}</span></div>
              <button className="btn" onClick={() => removeFriendship(f.id).then(reload)}>Отменить</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
