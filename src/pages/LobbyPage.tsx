import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  listOpenTables, createTable, joinTableSecure, subscribeLobby, findQuickCandidates,
  tableMode, tableCoins, type TableListItem, type TableMode,
} from '../lib/online';
import { getFriends, createInvite, type MiniProfile } from '../lib/friends';
import { useOnline } from '../lib/presence';
import Modal from '../components/Modal';
import { IconDice, IconUsers } from '../components/icons';
import type { Variant } from '../lib/online.types';

/** Заготовленные ставки A-COINS для быстрого выбора (заглушки на будущее). */
const COIN_PRESETS = [50, 100, 150, 200, 500, 1000];
/** Фильтр списка столов по типу. */
type TableFilter = 'all' | 'normal' | 'coins';
/** Шаг сценария входа за чужой стол. */
type JoinStep = 'password' | 'coinsInfo' | 'coinsConfirm';

export default function LobbyPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const { isOnline } = useOnline();
  const [tables, setTables] = useState<TableListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState<TableFilter>('all');
  const [query, setQuery] = useState('');

  // Создание стола: сперва выбор типа, затем модалка «Новый стол».
  const [chooseType, setChooseType] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createMode, setCreateMode] = useState<TableMode>('normal');
  const [name, setName] = useState('');
  const [variant, setVariant] = useState<Variant>('short');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [password, setPassword] = useState('');
  const [coins, setCoins] = useState<number>(100);
  const [friends, setFriends] = useState<MiniProfile[]>([]);
  const [invitee, setInvitee] = useState<MiniProfile | null>(null);

  // Вход за чужой стол: пошаговый сценарий (пароль / разъяснение A-COINS / подтверждение).
  const [joinTarget, setJoinTarget] = useState<TableListItem | null>(null);
  const [joinStep, setJoinStep] = useState<JoinStep | null>(null);
  const [joinPassword, setJoinPassword] = useState('');

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

  // Переход из модалки окончания партии («Создать стол») открывает выбор типа.
  useEffect(() => {
    const st = location.state as { create?: boolean } | null;
    if (auth.user && st?.create) {
      openChooseType();
      nav('/lobby', { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user, location.state]);

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

  function openChooseType() {
    setError(null);
    setChooseType(true);
  }

  function pickType(mode: TableMode) {
    setCreateMode(mode);
    setName(''); setVariant('short'); setVisibility('public');
    setPassword(''); setCoins(100); setInvitee(null);
    setChooseType(false);
    setCreating(true);
    if (friends.length === 0) getFriends().then((b) => setFriends(b.friends.map((f) => f.profile))).catch(() => {});
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Укажите название стола'); return; }
    if (visibility === 'private' && !password.trim()) { setError('Задайте пароль для приватного стола'); return; }
    if (createMode === 'coins' && (coins <= 0 || coins % 50 !== 0)) { setError('Ставка A-COINS должна быть кратна 50'); return; }
    setBusy(true); setError(null);
    try {
      const table = await createTable({
        name: name.trim(),
        variant,
        visibility,
        mode: createMode,
        coins: createMode === 'coins' ? coins : undefined,
        password: visibility === 'private' ? password.trim() : undefined,
      });
      if (invitee) { try { await createInvite(table.id, invitee.id); } catch { /* инвайт не критичен */ } }
      nav(`/table/${table.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать стол');
    } finally { setBusy(false); }
  }

  // «Любой стол» — быстрый подбор живого соперника (обычные быстрые столы).
  async function quickPlay() {
    setError(null); setSearching(true); setBusy(true);
    try {
      const cands = await findQuickCandidates('short');
      for (const c of cands) {
        if (!isOnline(c.owner_id)) continue;
        try { await joinTableSecure(c.id); nav(`/table/${c.id}`); return; }
        catch { /* стол только что заняли — пробуем следующего */ }
      }
      const table = await createTable({ name: 'Быстрая игра', variant: 'short', visibility: 'public', quick: true });
      nav(`/table/${table.id}`, { state: { quick: true } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать поиск');
      setSearching(false); setBusy(false);
    }
  }

  // Клик по кнопке входа за чужой стол — запускаем нужный сценарий.
  function startJoin(t: TableListItem) {
    setError(null);
    setJoinTarget(t);
    setJoinPassword('');
    if (t.visibility === 'private') setJoinStep('password');
    else if (tableMode(t) === 'coins') setJoinStep('coinsInfo');
    else void performJoin(t, undefined);
  }

  // После пароля: если стол за монеты — идём к разъяснению, иначе сразу входим.
  function afterPassword() {
    if (!joinTarget) return;
    if (!joinPassword.trim()) { setError('Введите пароль'); return; }
    setError(null);
    if (tableMode(joinTarget) === 'coins') setJoinStep('coinsInfo');
    else void performJoin(joinTarget, joinPassword.trim());
  }

  async function performJoin(t: TableListItem, pwd?: string) {
    setBusy(true); setError(null);
    try {
      await joinTableSecure(t.id, pwd);
      closeJoin();
      nav(`/table/${t.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось присоединиться';
      setError(msg);
      // Неверный пароль — оставляем игрока на шаге ввода пароля.
      if (/парол/i.test(msg) && t.visibility === 'private') setJoinStep('password');
    } finally { setBusy(false); }
  }

  function closeJoin() { setJoinTarget(null); setJoinStep(null); setJoinPassword(''); }

  // Показываем только столы, чей владелец сейчас в сети, применяем фильтр типа
  // и «умный» поиск по названию стола / имени игрока (мгновенно, без кнопки).
  const q = query.trim().toLowerCase();
  const visibleTables = tables
    .filter((t) => isOnline(t.owner_id))
    .filter((t) => (filter === 'all' ? true : tableMode(t) === filter))
    .filter((t) => {
      if (!q) return true;
      const byName = t.name.toLowerCase().includes(q);
      const byOwner = (t.owner?.display_name ?? '').toLowerCase().includes(q);
      return byName || byOwner;
    });

  return (
    <section className="lobby">
      <Link className="btn btn--back" to="/">← На главную</Link>
      <div className="lobby__head">
        <h1>Лобби</h1>
        <div className="lobby__actions">
          <button className="btn" onClick={refresh}>Обновить</button>
          <button className="btn btn--primary" onClick={quickPlay} disabled={busy || searching}>
            {searching ? 'Поиск соперника…' : 'Любой стол'}
          </button>
          <button className="btn" onClick={openChooseType} disabled={searching}>Создать стол</button>
        </div>
      </div>

      {error && !joinStep && !creating && !chooseType && <p className="auth__error" role="alert">{error}</p>}

      {/* Переключатели фильтра типа столов */}
      <div className="lobby__filters seg" role="tablist" aria-label="Фильтр столов">
        <button type="button" className={'chip' + (filter === 'all' ? ' is-active' : '')} onClick={() => setFilter('all')}>Все</button>
        <button type="button" className={'chip' + (filter === 'normal' ? ' is-active' : '')} onClick={() => setFilter('normal')}>Обычная игра</button>
        <button type="button" className={'chip' + (filter === 'coins' ? ' is-active' : '')} onClick={() => setFilter('coins')}>Игра за A-COINS</button>
      </div>

      {/* Умный поиск: мгновенная фильтрация по названию стола или имени игрока. */}
      <div className="lobby__search" role="search">
        <span className="lobby__search-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          className="lobby__search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию стола или игроку…"
          aria-label="Поиск стола по названию или игроку"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            className="lobby__search-clear"
            aria-label="Очистить поиск"
            onClick={() => setQuery('')}
          >×</button>
        )}
      </div>

      <div className="lobby__list">
        {loading ? <p>Загрузка столов…</p>
          : visibleTables.length === 0 ? <p className="lobby__empty">{q ? 'По вашему запросу столов не найдено.' : 'Открытых столов пока нет. Создайте свой!'}</p>
          : visibleTables.map((t) => {
              const seatCount = t.seats?.[0]?.count ?? 0;
              const isCoins = tableMode(t) === 'coins';
              const isPrivate = t.visibility === 'private';
              // Для приватных столов число мест по RLS не видно — на занятость
              // проверит сервер при входе; кнопку не блокируем по счётчику.
              const full = !isPrivate && seatCount >= 2;
              const joinLabel = isCoins ? 'Играть' : isPrivate ? 'Войти' : 'Сесть';
              return (
                <div key={t.id} className="card table-row">
                  <div className="table-row__info">
                    <strong>{t.name}</strong>
                    <span className="table-row__meta">
                      хозяин {t.owner?.display_name ?? '—'}
                    </span>
                    <span className="table-row__badges">
                      <span className="badge">{t.variant === 'short' ? 'Короткие' : 'Длинные'}</span>
                      {isCoins
                        ? <span className="badge badge--coins">За A-COINS · {tableCoins(t)}</span>
                        : <span className="badge">Обычная</span>}
                      {isPrivate
                        ? <span className="badge badge--lock">🔒 Приватный</span>
                        : <span className="badge">Открытый</span>}
                    </span>
                  </div>
                  <button className="btn btn--primary" disabled={busy || full} onClick={() => startJoin(t)}>
                    {full ? 'Занят' : joinLabel}
                  </button>
                </div>
              );
            })}
      </div>

      {/* Модалка П2: выбор типа стола */}
      {chooseType && (
        <Modal className="type-choice" onClose={() => setChooseType(false)}>
          <h2>Выберите тип стола</h2>
          <p className="setup__subtitle">На чём играем — обычная партия или ставка в A-COINS</p>
          <div className="type-choice__grid">
            <button type="button" className="type-choice__btn" onClick={() => pickType('normal')}>
              <span className="type-choice__ic"><IconDice /></span>
              <strong>Обычная игра</strong>
              <span>Партия без ставок, на рейтинг</span>
            </button>
            <button type="button" className="type-choice__btn type-choice__btn--coins" onClick={() => pickType('coins')}>
              <span className="type-choice__ic">🪙</span>
              <strong>Игра за A-COINS</strong>
              <span>Со ставкой во внутриигровых монетах</span>
            </button>
          </div>
        </Modal>
      )}

      {/* Модалка П3/П4: Новый стол */}
      {creating && (
        <Modal className="setup" onClose={() => setCreating(false)}>
          <form onSubmit={onCreate}>
            <h2>Новый стол{createMode === 'coins' ? ' · за A-COINS' : ''}</h2>
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

            {/* П4: ставка A-COINS (только для стола за монеты) */}
            {createMode === 'coins' && (
              <div className="setup__group">
                <span className="setup__label">🪙 Ставка входа, A-COINS</span>
                <input
                  className="setup__coins-input" type="number" min={50} step={50}
                  value={coins}
                  onChange={(e) => setCoins(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                />
                <div className="seg setup__coins-presets">
                  {COIN_PRESETS.map((v) => (
                    <button type="button" key={v}
                      className={'chip' + (coins === v ? ' is-active' : '')}
                      onClick={() => setCoins(v)}>{v}</button>
                  ))}
                </div>
                <div className="setup__hint">Ставка кратна 50 A-COINS. Пока это заглушка — резервирование монет на балансе появится позже (1 ₽ = 1 A-COIN).</div>
              </div>
            )}

            <div className="setup__group">
              <span className="setup__label"><IconUsers /> Соперник</span>
              <div className="seg">
                <button type="button" className={'chip' + (visibility === 'public' ? ' is-active' : '')}
                  onClick={() => setVisibility('public')}>Открытый стол</button>
                <button type="button" className={'chip' + (visibility === 'private' ? ' is-active' : '')}
                  onClick={() => setVisibility('private')}>Приватный</button>
              </div>

              {/* П3: пароль приватного стола */}
              {visibility === 'private' ? (
                <label className="field setup__pass">
                  <span>Пароль стола</span>
                  <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Придумайте пароль" autoComplete="off" />
                  <span className="setup__hint">Сообщите пароль сопернику — он введёт его, чтобы сесть за стол.</span>
                </label>
              ) : (
                <div className="setup__hint">Открытый стол виден всем в лобби — сесть может любой.</div>
              )}

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

            {error && <p className="auth__error" role="alert">{error}</p>}
            <div className="profile__actions">
              <button className="btn btn--primary" type="submit" disabled={busy}>
                {busy ? 'Создание…' : (invitee ? 'Создать и позвать' : 'Создать и сесть')}
              </button>
              <button className="btn" type="button" onClick={() => setCreating(false)}>Отмена</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Вход за чужой стол — шаг «пароль» */}
      {joinStep === 'password' && joinTarget && (
        <Modal className="setup" onClose={closeJoin}>
          <h2>Приватный стол</h2>
          <p className="setup__subtitle">«{joinTarget.name}» — введите пароль, чтобы сесть за стол</p>
          <label className="field">
            <span>Пароль</span>
            <input type="text" value={joinPassword} autoFocus autoComplete="off"
              onChange={(e) => setJoinPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') afterPassword(); }} />
          </label>
          {error && <p className="auth__error" role="alert">{error}</p>}
          <div className="profile__actions">
            <button className="btn btn--primary" onClick={afterPassword} disabled={busy}>
              {busy ? 'Проверка…' : 'Войти'}
            </button>
            <button className="btn" onClick={closeJoin}>Отмена</button>
          </div>
        </Modal>
      )}

      {/* Вход за стол за A-COINS — шаг «разъяснение резерва» */}
      {joinStep === 'coinsInfo' && joinTarget && (
        <Modal className="setup" onClose={closeJoin}>
          <h2>Игра за A-COINS</h2>
          <p className="setup__subtitle">Стол «{joinTarget.name}»</p>
          <div className="coins-info">
            <p>Для входа за этот стол потребуется ставка <strong>{tableCoins(joinTarget)} A-COINS</strong>.</p>
            <p>Эта сумма будет <strong>зарезервирована</strong> на вашем балансе на время партии: победитель забирает банк, при выходе из партии ставка проигрывается.</p>
            <p className="setup__hint">Внутриигровая валюта A-COINS: 1 ₽ = 1 A-COIN. Резервирование — заглушка на этом этапе.</p>
          </div>
          {error && <p className="auth__error" role="alert">{error}</p>}
          <div className="profile__actions">
            <button className="btn btn--primary" onClick={() => setJoinStep('coinsConfirm')} disabled={busy}>Играть</button>
            <button className="btn" onClick={closeJoin}>Отмена</button>
          </div>
        </Modal>
      )}

      {/* Вход за стол за A-COINS — шаг «финальное подтверждение» */}
      {joinStep === 'coinsConfirm' && joinTarget && (
        <Modal className="setup" onClose={closeJoin}>
          <h2>Подтвердите вход</h2>
          <p className="setup__subtitle">Проверьте условия захода за стол</p>
          <ul className="coins-confirm">
            <li><span>Стол</span><strong>{joinTarget.name}</strong></li>
            <li><span>Вид нард</span><strong>{joinTarget.variant === 'short' ? 'Короткие' : 'Длинные'}</strong></li>
            <li><span>Ставка</span><strong>{tableCoins(joinTarget)} A-COINS</strong></li>
            <li><span>Резерв на балансе</span><strong>{tableCoins(joinTarget)} A-COINS</strong></li>
          </ul>
          {error && <p className="auth__error" role="alert">{error}</p>}
          <div className="profile__actions">
            <button className="btn btn--primary" onClick={() => performJoin(joinTarget, joinPassword.trim() || undefined)} disabled={busy}>
              {busy ? 'Вход…' : 'Подтвердить и сесть'}
            </button>
            <button className="btn" onClick={() => setJoinStep('coinsInfo')} disabled={busy}>Назад</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
