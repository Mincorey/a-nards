/* =============================================================================
 * BotGame.tsx — Игровая область «против бота». Настройки задаются в модалке
 * (PlayPage), партия хранится в BotGameSession (контекст). Здесь доска, панели
 * игроков и статус над доской.
 * В мобильном ландшафте (см. CSS) текстовые уведомления показываются НЕ по
 * центру над доской, а бабблами над аватаром соответствующего игрока: сообщения
 * про ход человека — над его аватаром, про соперника — над аватаром бота.
 * ========================================================================== */
import { useEffect, useMemo, useState } from 'react';
import Board from './board/Board';
import DieFace from './board/DieFace';
import PlayerPanel from './PlayerPanel';
import Modal from './Modal';
import { useAuth } from '../lib/auth';
import { useBotGameSession } from '../game/BotGameSession';

interface Props {
  onNewGame: () => void;
}

export default function BotGame({ onNewGame }: Props) {
  const auth = useAuth();
  const { game: g, paused } = useBotGameSession();
  const targetSet = useMemo(() => new Set(g.targets.map((m) => m.to)), [g.targets]);
  const [overDismissed, setOverDismissed] = useState(false);

  // Как только партия перестала быть завершённой (новый старт/сброс) — снова
  // разрешаем показывать модалку победы для следующего завершения.
  useEffect(() => {
    if (g.phase !== 'gameover') setOverDismissed(false);
  }, [g.phase]);

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
          className="game__p" name={auth.profile?.display_name ?? 'Вы'} color="w" you online
          avatarUrl={auth.profile?.avatar_url}
          active={whiteActive} turnKey={g.rollId} seconds={45} note={youNote}
        />
      </div>

      {g.phase === 'gameover' && !overDismissed && (
        <Modal onClose={() => setOverDismissed(true)}>
          <h2>{g.winner === 'w' ? 'Победа!' : 'Поражение'}</h2>
          <p>{g.winner === 'w' ? 'Вы вынесли все шашки первыми.' : 'Бот вынес все шашки первым.'}</p>
          <div className="profile__actions">
            <button className="btn btn--primary" onClick={g.reset}>Сыграть ещё</button>
            <button className="btn" onClick={onNewGame}>Изменить настройки</button>
          </div>
        </Modal>
      )}
    </>
  );
}
