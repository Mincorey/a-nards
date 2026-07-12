import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Board from '../components/board/Board';
import PlayerPanel from '../components/PlayerPanel';
import ConfirmModal from '../components/ConfirmModal';
import GameSettingsModal from '../components/GameSettingsModal';
import GameOverModal from '../components/GameOverModal';
import GameChat from '../components/GameChat';
import ChatPickerModal from '../components/ChatPickerModal';
import { IconGear, IconExit } from '../components/icons';
import { useAuth } from '../lib/auth';
import { useOnline } from '../lib/presence';
import { useOnlineGame } from '../hooks/useOnlineGame';
import { useRegisterNavGuard, useNavGuardRef } from '../lib/navGuard';
import { getTable, leaveTable, startGame, subscribeTable, fetchMyRating, createChatChannel, resignGame, claimTimeout, deleteTable, type TableFull } from '../lib/online';
import { shouldClaimTimeout } from '../game/timeout';
import { setInGame } from '../lib/music';
import { getFriends, createInvite, type MiniProfile } from '../lib/friends';
import { useGameChat } from '../game/chat';
import type { Color } from '../engine/types';

export default function TablePage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const nav = useNavigate();
  const { isOnline } = useOnline();
  const guard = useNavGuardRef();
  const [data, setData] = useState<TableFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [friends, setFriends] = useState<MiniProfile[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [overDismissed, setOverDismissed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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

  const selfName = mySeat?.profile?.display_name ?? 'Вы';
  const selfAvatar = mySeat?.profile?.avatar_url ?? null;
  // Онлайн-транспорт чата (Supabase broadcast) — один на стол, пока мы за ним.
  const chatTransport = useMemo(
    () => (id && auth.user ? createChatChannel(id) : undefined),
    [id, auth.user],
  );
  const chat = useGameChat({ name: selfName, avatarUrl: selfAvatar, color: (myColor ?? 'w') as Color }, chatTransport);

  useEffect(() => { if (g.phase !== 'gameover') setOverDismissed(false); }, [g.phase]);

  // Партия за столом идёт — переход по верхнему меню должен подтверждаться;
  // после подтверждения освобождаем место за столом, как и по кнопке «Выйти».
  const leaveNow = useCallback(() => {
    // Уход из АКТИВНОЙ партии = сдача: соперник получает победу, затем место освобождается.
    const gid = g.game && g.game.status === 'playing' ? g.game.id : null;
    if (gid) void resignGame(gid).catch(() => { /* всё равно уходим */ });
    void leaveTable(id);
  }, [id, g.game]);
  useRegisterNavGuard(Boolean(g.game && g.game.status === 'playing'), leaveNow);

  // Рейтинг ДО партии — чтобы показать прирост после победы. Захватываем при
  // старте КАЖДОЙ новой партии (по её id) и сбрасываем прошлый результат.
  const ratingBeforeRef = useRef<number | null>(null);
  const capturedGameRef = useRef<string | null>(null);
  const [ratingInfo, setRatingInfo] = useState<{ after: number; delta: number } | null>(null);
  useEffect(() => {
    const gid = g.game && g.game.status === 'playing' ? g.game.id : null;
    if (gid && capturedGameRef.current !== gid) {
      capturedGameRef.current = gid;
      ratingBeforeRef.current = mySeat?.profile?.rating ?? null;
      setRatingInfo(null);
    }
  }, [g.game, mySeat]);

  // Фоновая музыка играет, пока идёт партия за столом (и включена в настройках).
  useEffect(() => {
    const playing = Boolean(g.game && g.game.status === 'playing');
    setInGame(playing);
    return () => setInGame(false);
  }, [g.game]);

  // Победа онлайн — подтягиваем обновлённый рейтинг (finalize_game уже применил
  // Elo на сервере) и считаем прирост относительно захваченного «до».
  useEffect(() => {
    if (g.phase !== 'gameover' || g.game?.winner !== myColor) return;
    if (ratingBeforeRef.current == null || ratingInfo) return;
    let alive = true;
    fetchMyRating().then((after) => {
      if (!alive || after == null) return;
      setRatingInfo({ after, delta: after - (ratingBeforeRef.current ?? after) });
    }).catch(() => { /* рейтинг не критичен для показа модалки */ });
    return () => { alive = false; };
  }, [g.phase, g.game, myColor, ratingInfo]);

  // Таймаут хода: если сейчас ход СОПЕРНИКА и он не ходит дольше лимита (пропал
  // интернет / свернул игру) — засчитываем ему поражение через сервер (сервер
  // сам проверит срок по updated_at). Таймер держит присутствующий игрок.
  useEffect(() => {
    const game = g.game;
    if (!game || game.status !== 'playing' || !myColor || game.turn === myColor) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (shouldClaimTimeout(game, myColor)) claimTimeout(game.id).catch(() => { /* сервер отклонит, если рано */ });
    };
    const iv = window.setInterval(tick, 4000);
    tick();
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [g.game, myColor]);

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
  async function doLeave() {
    setConfirmLeave(false);
    try {
      if (activeGame && g.game) await resignGame(g.game.id); // выход во время партии = сдача
      else if (data && data.table.owner_id === auth.user?.id) await deleteTable(id); // владелец закрывает неначатый стол
      await leaveTable(id);
    } catch { /* всё равно уходим */ }
    nav('/lobby');
  }
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
        active={isTurn} turnKey={g.rollId} seconds={90}
        you={color === myColor}
        online={s?.user_id ? isOnline(s.user_id) : undefined}
        onSettings={color === myColor ? () => setSettingsOpen(true) : undefined}
        onFinish={color === myColor && activeGame ? () => guard.requestLeave.current?.('/') : undefined}
        onChat={color === myColor && activeGame ? () => setChatOpen(true) : undefined}
        chatBubble={color === myColor ? chat.lastSelf : chat.lastOpponent}
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
        {activeGame && (
          <button
            type="button"
            className="game__finish-mobile"
            onClick={() => guard.requestLeave.current?.('/')}
            aria-label="Завершить игру"
            title="Завершить игру"
          >
            <IconExit />
          </button>
        )}
      </div>

      {activeGame && mySeat && (
        <GameChat className="game__chat" messages={chat.messages} onSend={chat.send} />
      )}

      {settingsOpen && <GameSettingsModal onClose={() => setSettingsOpen(false)} />}
      {chatOpen && <ChatPickerModal onPick={chat.send} onClose={() => setChatOpen(false)} />}

      {g.phase === 'gameover' && !overDismissed && (
        <GameOverModal
          won={g.game?.winner === myColor}
          subtitle={g.game?.winner === myColor ? 'Вы вынесли все шашки первыми.' : 'Соперник вынес все шашки первым.'}
          rating={ratingInfo}
          onAgain={onStart}
          onLobby={() => nav('/')}
          onClose={() => setOverDismissed(true)}
        />
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
