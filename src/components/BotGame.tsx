/* =============================================================================
 * BotGame.tsx — Игровая область «против бота». Настройки задаются в модалке
 * (PlayPage), партия хранится в BotGameSession (контекст). Здесь доска, панели
 * игроков и статус над доской.
 * В мобильном ландшафте (см. CSS) текстовые уведомления показываются НЕ по
 * центру над доской, а бабблами над аватаром соответствующего игрока: сообщения
 * про ход человека — над его аватаром, про соперника — над аватаром бота.
 * ========================================================================== */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Board from './board/Board';
import DieFace from './board/DieFace';
import PlayerPanel from './PlayerPanel';
import GameSettingsModal from './GameSettingsModal';
import GameChat from './GameChat';
import ChatPickerModal from './ChatPickerModal';
import { IconGear, IconExit } from './icons';
import { useNavGuardRef } from '../lib/navGuard';
import { useGameChat } from '../game/chat';
import { useAuth } from '../lib/auth';
import { useBotGameSession } from '../game/BotGameSession';
import { setInGame } from '../lib/music';
import GameOverModal from './GameOverModal';

interface Props {
  onNewGame: () => void;
}

export default function BotGame({ onNewGame }: Props) {
  const auth = useAuth();
  const nav = useNavigate();
  const guard = useNavGuardRef();
  const { game: g, paused } = useBotGameSession();
  const targetSet = useMemo(() => new Set(g.targets.map((m) => m.to)), [g.targets]);
  const [overDismissed, setOverDismissed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const selfName = auth.profile?.display_name ?? 'Вы';
  const selfAvatar = auth.profile?.avatar_url ?? null;
  const chat = useGameChat({ name: selfName, avatarUrl: selfAvatar, color: 'w' });

  // Как только партия перестала быть завершённой (новый старт/сброс) — снова
  // разрешаем показывать модалку победы для следующего завершения.
  useEffect(() => {
    if (g.phase !== 'gameover') setOverDismissed(false);
  }, [g.phase]);

  // Фоновая музыка играет, пока мы на игровом экране (и включена в настройках).
  useEffect(() => {
    setInGame(true);
    return () => setInGame(false);
  }, []);

  const whiteActive = g.phase === 'humanRoll' || g.phase === 'humanMove';
  const blackActive = g.phase === 'botTurn';
  const isOpening = g.phase === 'openingRoll';
  // Уведомление направляем к аватару того, чей сейчас ход (в ландшафте — см. CSS).
  const youNote = whiteActive ? g.message : null;
  const botNote = blackActive ? g.message : null;

  return (
    <>
      <div className={'game__table' + (paused ? ' is-paused' : '')}>
        <PlayerPanel
          className="game__p" name="Бот" color="b"
          active={blackActive} turnKey={g.rollId} seconds={20} note={botNote}
        />
        <div className="game__board">
          <div className={'game__status' + (whiteActive ? ' is-you' : '') + (isOpening ? ' game__status--opening' : '')}>
            {g.phase === 'openingRoll' && g.openingDice ? (
              <div className="opening-roll">
                <div className="opening-roll__row">
                  <span className="opening-roll__label">Соперник бросил</span>
                  <DieFace value={g.openingDice.bot} size={30} />
                </div>
                <div className="opening-roll__row">
                  <span className="opening-roll__label">Вы бросили</span>
                  <DieFace value={g.openingDice.human} size={30} />
                </div>
                <span className="opening-roll__result">{g.message}</span>
              </div>
            ) : (
              g.message
            )}
          </div>
          <Board
            state={g.game}
            selected={g.selected}
            sources={g.sources}
            targets={targetSet}
            onPick={g.pick}
            rollId={g.rollId}
            diceRemaining={g.game.dice.length}
            canRoll={g.phase === 'humanRoll'}
            onRoll={g.roll}
            myColor="w"
          />
        </div>
        <PlayerPanel
          className="game__p" name={selfName} color="w" you online
          avatarUrl={selfAvatar}
          active={whiteActive} turnKey={g.rollId} seconds={45} note={youNote}
          onSettings={() => setSettingsOpen(true)}
          onFinish={() => guard.requestLeave.current?.('/')}
          onChat={() => setChatOpen(true)}
          chatBubble={chat.lastSelf}
        />

        <button
          type="button"
          className="game__gear-mobile"
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки игры"
          title="Настройки игры"
        >
          <IconGear />
        </button>
        <button
          type="button"
          className="game__finish-mobile"
          onClick={() => guard.requestLeave.current?.('/')}
          aria-label="Завершить игру"
          title="Завершить игру"
        >
          <IconExit />
        </button>
      </div>

      <GameChat className="game__chat" messages={chat.messages} onSend={chat.send} />

      {settingsOpen && <GameSettingsModal onClose={() => setSettingsOpen(false)} />}
      {chatOpen && <ChatPickerModal onPick={chat.send} onClose={() => setChatOpen(false)} />}

      {g.phase === 'gameover' && !overDismissed && (
        <GameOverModal
          won={g.winner === 'w'}
          subtitle={g.winner === 'w' ? 'Вы вынесли все шашки первыми.' : 'Бот вынес все шашки первым.'}
          onAgain={g.reset}
          extra={{ label: 'Изменить настройки', onClick: onNewGame }}
          onLobby={() => nav('/')}
          onClose={() => setOverDismissed(true)}
        />
      )}
    </>
  );
}
