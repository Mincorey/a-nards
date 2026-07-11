import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BotGame from '../components/BotGame';
import Modal from '../components/Modal';
import { IconDice, IconRobot } from '../components/icons';
import { useBotGameSession } from '../game/BotGameSession';
import { useOverlay } from '../game/pause';
import { useRegisterNavGuard } from '../lib/navGuard';
import type { Difficulty } from '../game/bot';
import type { Variant } from '../engine/types';

const DIFFS: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'Лёгкий' },
  { key: 'medium', label: 'Средний' },
  { key: 'hard', label: 'Сложный' },
];
const VARIANTS: { key: Variant; label: string }[] = [
  { key: 'short', label: 'Короткие' },
  { key: 'long', label: 'Длинные' },
];

export default function PlayPage() {
  const session = useBotGameSession();
  const nav = useNavigate();
  // временные значения в модалке настроек — фиксируются только по «Начать игру»
  const [tv, setTv] = useState<Variant>(session.variant);
  const [td, setTd] = useState<Difficulty>(session.difficulty);

  // Партия «активна», если модалка настроек закрыта (игра реально идёт) и она
  // ещё не завершена — тогда переход по верхнему меню должен подтверждаться.
  useRegisterNavGuard(!session.setupOpen && session.game.phase !== 'gameover', session.abandon);

  // Пока открыта модалка настроек — партия «за кадром» на паузе (не тикает).
  useOverlay(session.setupOpen);

  function openSetup() {
    setTv(session.variant);
    setTd(session.difficulty);
    session.openSetup();
  }

  // Закрытие модалки настроек (крестик / клик по фону / Esc), а НЕ «Начать игру».
  // ВСЕГДА возвращаем пользователя на предыдущую страницу (откуда он открыл
  // «Игра с ботом»). Раньше при наличии «начатой» партии (в т.ч. оставшейся от
  // прошлого раза после abandon → reset) закрытие крестиком вызывало
  // closeSetup() и показывало партию — из-за чего игра «всё равно начиналась» и
  // приходилось из неё выходить. Теперь закрытие настроек = «передумал играть».
  function closeSetupModal() {
    nav(-1);
  }

  return (
    <section className="game">
      {/* Доска подгружается только когда партия реально идёт (модалка настроек
          закрыта). До «Начать игру» показываем ТОЛЬКО модальное окно настроек,
          без доски на фоне — сама партия «за кадром» в контексте не видна. */}
      {!session.setupOpen && <BotGame onNewGame={openSetup} />}

      {session.setupOpen && (
        <Modal className="setup" onClose={closeSetupModal}>
          <h2>Игра с ботом</h2>
          <p className="setup__subtitle">Выберите вид нард и уровень сложности соперника</p>

          <div className="setup__group">
            <span className="setup__label"><IconDice /> Вид нард</span>
            <div className="seg">
              {VARIANTS.map((v) => (
                <button key={v.key} className={'chip' + (tv === v.key ? ' is-active' : '')}
                  onClick={() => setTv(v.key)}>{v.label}</button>
              ))}
            </div>
          </div>
          <div className="setup__group">
            <span className="setup__label"><IconRobot /> Сложность бота</span>
            <div className="seg">
              {DIFFS.map((d) => (
                <button key={d.key} className={'chip' + (td === d.key ? ' is-active' : '')}
                  onClick={() => setTd(d.key)}>{d.label}</button>
              ))}
            </div>
          </div>
          <button className="btn btn--primary" onClick={() => session.start(tv, td)}>
            <IconDice /> Начать игру
          </button>
        </Modal>
      )}
    </section>
  );
}
