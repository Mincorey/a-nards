import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Board from '../components/board/Board';
import PlayerPanel from '../components/PlayerPanel';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import GameSettingsModal from '../components/GameSettingsModal';
import { IconGear } from '../components/icons';
import { useAuth } from '../lib/auth';
import { useOnline } from '../lib/presence';
import { useOnlineGame } from '../hooks/useOnlineGame';
import { useRegisterNavGuard } from '../lib/navGuard';
import { getTable, leaveTable, startGame, subscribeTable, type TableFull } from '../lib/online';
import { getFriends, createInvite, type MiniProfile } from '../lib/friends';
import type { Color } from '../engine/types';

export default function TablePage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const nav = useNavigate();
  const { isOnline } = useOnline();
  const [data, setData] = useState<TableFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [friends, setFriends] = useState<MiniProfile[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [overDismissed, setOverDismissed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const reload = useCallback(() => {
    getTable(id).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, [id]);

  useEffect(() => {
    if (!id || !auth.user) return;
    reload();
    const unsub = subscribeTable(id, { onSeats: reload, onTable: reload }, 'room');
    return unsub;
  }, [id, auth.user, reload]);

  const mySeat = useMemo(
    () => data?.seats.find((s) => s.user_id === auth.user?.id) ?? null,
    [data, auth.user],
  );
  const myColor: Color | null = mySeat ? (mySeat.color as Color) : null;
  const g = useOnlineGame(id, myColor);

  useEffect(() => { if (g.phase !== 'gameover') setOverDismissed(false); }, [g.phase]);

  // Партия за столом идёт — переход по верхнему меню должен подтверждаться;
  // после подтверждения освобождаем место за столом, как и по кнопке «Выйти».
  const leaveNow = useCallback(() => { void leaveTable(id); }, [id]);
  useRegisterNavGuard(Boolean(g.game && g.game.status === 'playing'), leaveNow);

  if (!auth.ready) return <section className="table"><div className="card"><p>Загрузка…</p></div></section>;
  if (!auth.user) {
    return (
      <section className="table"><div className="card">
        <h1>Стол</h1><p>Войдите, чтобы играть.</p>
        <button className="btn btn--primary" onClick={() => nav('/auth')}>Войти</button>
      </div></section>
    );
  }
  if (!data) return <section className="table"><div className="card"><p>{error ?? 'Загрузка стола…'}</p></div></section>;

  const seats = data.seats;
  const full = seats.length >= 2;
  const activeGame = g.game && g.game.status === 'playing';
  const canStart = full && Boolean(mySeat) && !activeGame;

  async function onStart() {
    setStarting(true); setError(null);
    try { await startGame(id); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось начать'); }
    finally { setStarting(false); }
  }
  async function doLeave() { setConfirmLeave(false); await leaveTable(id); nav('/lobby'); }
  function onLeaveClick() {
    if (activeGame) setConfirmLeave(true);
    else void doLeave();
  }
  async function openInvite() {
    setShowInvite((v) => !v);
    if (friends.length === 0) {
      try { const b = await getFriends(); setFriends(b.friends.map((f) => f.profile)); } catch { /* ignore */ }
    }
  }
  async function invite(friendId: string) {
    setNote(null); setError(null);
    try { await createInvite(id, friendId); setNote('Приглашение отправлено'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось пригласить'); }
  }

  const targetSet = new Set(g.targets.map((m) => m.to));
  const interactive = g.phase === 'myMove';

  function panel(color: Color) {
    const s = seats.find((x) => x.color === color);
    const isTurn = Boolean(activeGame && g.game?.turn === color);
    return (
      <PlayerPanel
        className="game__p"
        name={s?.profile?.display_name ?? (s ? 'Игрок' : 'Свободно')}
        color={color}
        avatarUrl={s?.profile?.avatar_url}
        active={isTurn} turnKey={g.rollId} seconds={60}
        you={color === myColor}
        online={s?.user_id ? isOnline(s.user_id) : undefined}
        onSettings={color === myColor ? () => setSettingsOpen(true) : undefined}
      />
    );
  }

  return (
    <section className="game">
      <div className="tp-head">
        <div>
          <h1>{data.table.name}</h1>
          <span className="tp-sub">{data.table.variant === 'short' ? 'Короткие нарды' : 'Длинные нарды'} · код {id.slice(0, 8)}</span>
        </div>
        <button className="btn" onClick={onLeaveClick}>Выйти из стола</button>
      </div>

      {(error || g.error) && <p className="auth__error" role="alert">{error ?? g.error}</p>}
      {note && <p className="auth__info">{note}</p>}

      <div className="game__table">
        {panel('w')}

        <div className="game__board">
          {activeGame && <div className={'game__status' + (g.phase === 'myMove' || g.phase === 'myRoll' ? ' is-you' : '')}>{g.message}</div>}
          {g.game && g.state ? (
            <Board
              state={g.state}
              selected={g.selected}
              sources={g.sources}
              targets={targetSet}
              onPick={interactive ? g.pick : undefined}
              rollId={g.rollId}
              diceRemaining={g.state.dice.length}
              canRoll={g.phase === 'myRoll'}
              onRoll={g.roll}
              myColor={myColor ?? undefined}
            />
          ) : (
            <div className="game__wait card">
              {!full ? (
                <>
                  <p>Ждём второго игрока. Пригласите друга или дождитесь соперника из лобби.</p>
                  {mySeat && (
                    <>
                      <button className="btn" onClick={openInvite}>Пригласить друга</button>
                      {showInvite && (
                        <div className="tp-invite">
                          {friends.length === 0 ? (
                            <p className="lobby__empty">Нет друзей. Добавьте их на странице «Друзья».</p>
                          ) : friends.map((f) => (
                            <div key={f.id} className="fr-row">
                              <span className={'fr-dot' + (isOnline(f.id) ? ' is-on' : '')} />
                              <div className="fr-row__id"><strong>{f.display_name}</strong><span>@{f.username}</span></div>
                              <button className="btn" onClick={() => invite(f.id)}>Позвать</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <p>Оба игрока на местах.</p>
                  {canStart && (
                    <button className="btn btn--primary" onClick={onStart} disabled={starting}>
                      {starting ? 'Старт…' : 'Начать игру'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {panel('b')}

        <button
          type="button"
          className="game__gear-mobile"
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки игры"
          title="Настройки игры"
        >
          <IconGear />
        </button>
      </div>

      {settingsOpen && <GameSettingsModal onClose={() => setSettingsOpen(false)} />}

      {g.phase === 'gameover' && !overDismissed && (
        <Modal onClose={() => setOverDismissed(true)}>
          <h2>{g.game?.winner === myColor ? 'Победа!' : 'Партия завершена'}</h2>
          <p>{g.game?.winner === myColor ? 'Вы вынесли все шашки первыми.' : 'Соперник вынес все шашки первым.'}</p>
          <div className="profile__actions">
            <button className="btn btn--primary" onClick={onStart} disabled={starting}>Сыграть ещё</button>
            <button className="btn" onClick={() => nav('/lobby')}>В лобби</button>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={confirmLeave}
        title="Выйти из партии?"
        message="Партия ещё не закончена. Если выйти сейчас, место за столом освободится."
        confirmLabel="Выйти"
        danger
        onConfirm={doLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </section>
  );
}
