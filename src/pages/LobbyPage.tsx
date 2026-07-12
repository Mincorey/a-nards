import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  listOpenTables, createTable, joinTable, subscribeLobby,
  type TableListItem,
} from '../lib/online';
import { getFriends, createInvite, type MiniProfile } from '../lib/friends';
import { useOnline } from '../lib/presence';
import Modal from '../components/Modal';
import { IconDice, IconUsers } from '../components/icons';
import type { Variant } from '../lib/online.types';

export default function LobbyPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const { isOnline } = useOnline();
  const [tables, setTables] = useState<TableListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Модалка создания стола
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [variant, setVariant] = useState<Variant>('short');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [friends, setFriends] = useState<MiniProfile[]>([]);
  const [invitee, setInvitee] = useState<MiniProfile | null>(null);

  const refresh = useCallback(() => {
    listOpenTables().then(setTables)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!auth.user) return;
    refresh();
    const unsub = subscribeLobby(refresh);
    return unsub;
  }, [auth.user, refresh]);

  if (!auth.ready) return <section className="lobby"><div className="card"><p>Загрузка…</p></div></section>;
  if (!auth.user) {
    return (
      <section className="lobby">
        <Link className="btn btn--back" to="/">← На главную</Link>
        <div className="card">
          <h1>Лобби</h1><p>Войдите, чтобы создавать столы и играть по сети.</p>
          <button className="btn btn--primary" onClick={() => nav('/auth')}>Войти</button>
        </div>
      </section>
    );
  }

  function openCreate() {
    setName(''); setVariant('short'); setVisibility('public'); setInvitee(null);
    setCreating(true);
    if (friends.length === 0) getFriends().then((b) => setFriends(b.friends.map((f) => f.profile))).catch(() => {});
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Укажите название стола'); return; }
    setBusy(true); setError(null);
    try {
      // Если зовём друга — стол приватный.
      const vis = invitee ? 'private' : visibility;
      const table = await createTable({ name: name.trim(), variant, visibility: vis });
      if (invitee) { try { await createInvite(table.id, invitee.id); } catch { /* инвайт не критичен */ } }
      nav(`/table/${table.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать стол');
    } finally { setBusy(false); }
  }

  async function onJoin(tid: string) {
    setBusy(true); setError(null);
    try { await joinTable(tid); nav(`/table/${tid}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось присоединиться'); }
    finally { setBusy(false); }
  }

  // Показываем только столы, чей владелец сейчас в сети — брошенные (владелец
  // ушёл, а стол завис в лобби) не показываем, чтобы никто не попал в мёртвую партию.
  const visibleTables = tables.filter((t) => isOnline(t.owner_id));

  return (
    <section className="lobby">
      <Link className="btn btn--back" to="/">← На главную</Link>
      <div className="lobby__head">
        <h1>Лобби</h1>
        <div className="lobby__actions">
          <button className="btn" onClick={refresh}>Обновить</button>
          <button className="btn btn--primary" onClick={openCreate}>Создать стол</button>
        </div>
      </div>

      {error && <p className="auth__error" role="alert">{error}</p>}

      <div className="lobby__list">
        {loading ? <p>Загрузка столов…</p>
          : visibleTables.length === 0 ? <p className="lobby__empty">Открытых столов пока нет. Создайте свой!</p>
          : visibleTables.map((t) => {
              const seatCount = t.seats?.[0]?.count ?? 0;
              const full = seatCount >= 2;
              return (
                <div key={t.id} className="card table-row">
                  <div className="table-row__info">
                    <strong>{t.name}</strong>
                    <span className="table-row__meta">
                      {t.variant === 'short' ? 'Короткие' : 'Длинные'} · хозяин {t.owner?.display_name ?? '—'} · {seatCount}/2
                    </span>
                  </div>
                  <button className="btn btn--primary" disabled={busy || full} onClick={() => onJoin(t.id)}>
                    {full ? 'Занят' : 'Сесть'}
                  </button>
                </div>
              );
            })}
      </div>

      {creating && (
        <Modal className="setup" onClose={() => setCreating(false)}>
          <form onSubmit={onCreate}>
            <h2>Новый стол</h2>
            <p className="setup__subtitle">Название, вид нард и с кем сесть за стол</p>
            <label className="field">
              <span>Название стола</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: вечерняя партия" autoFocus />
            </label>
            <div className="setup__group">
              <span className="setup__label"><IconDice /> Вид нард</span>
              <div className="seg">
                <button type="button" className={'chip' + (variant === 'short' ? ' is-active' : '')} onClick={() => setVariant('short')}>Короткие</button>
                <button type="button" className={'chip' + (variant === 'long' ? ' is-active' : '')} onClick={() => setVariant('long')}>Длинные</button>
              </div>
            </div>
            <div className="setup__group">
              <span className="setup__label"><IconUsers /> Соперник</span>
              <div className="seg">
                <button type="button" className={'chip' + (!invitee && visibility === 'public' ? ' is-active' : '')}
                  onClick={() => { setInvitee(null); setVisibility('public'); }}>Открытый стол</button>
                <button type="button" className={'chip' + (!invitee && visibility === 'private' ? ' is-active' : '')}
                  onClick={() => { setInvitee(null); setVisibility('private'); }}>Приватный</button>
              </div>
              <div className="setup__hint">
                {invitee ? `Пригласим: ${invitee.display_name}` : 'Открытый — любой из лобби; приватный — только по ссылке.'}
              </div>
              {friends.length > 0 && (
                <div className="setup__friends">
                  <span className="setup__label">Позвать друга</span>
                  {friends.map((f) => (
                    <button type="button" key={f.id}
                      className={'chip chip--friend' + (invitee?.id === f.id ? ' is-active' : '')}
                      onClick={() => setInvitee(invitee?.id === f.id ? null : f)}>
                      <span className={'fr-dot' + (isOnline(f.id) ? ' is-on' : '')} /> {f.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="profile__actions">
              <button className="btn btn--primary" type="submit" disabled={busy}>
                {busy ? 'Создание…' : (invitee ? 'Создать и позвать' : 'Создать и сесть')}
              </button>
              <button className="btn" type="button" onClick={() => setCreating(false)}>Отмена</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
