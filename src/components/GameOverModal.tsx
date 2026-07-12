/* =============================================================================
 * GameOverModal.tsx — Модалка завершения партии (победа/поражение).
 * При победе показывает золотой кубок и (для онлайна) изменение рейтинга,
 * проигрывает звук победы (victory.mp3) и ставит фоновую музыку на паузу, чтобы
 * не мешать. Кнопка «ЛОББИ» уводит на главную страницу.
 * ========================================================================== */
import { useEffect } from 'react';
import Modal from './Modal';
import { playVictory } from '../lib/sound';
import { pauseMusic } from '../lib/music';

export interface GameOverModalProps {
  won: boolean;
  subtitle: string;
  /** Онлайн: изменение рейтинга (после победы). Для игры с ботом — null. */
  rating?: { after: number; delta: number } | null;
  onLobby: () => void;
  onAgain?: () => void;
  againLabel?: string;
  /** Доп. кнопка (например «Изменить настройки» в партии с ботом). */
  extra?: { label: string; onClick: () => void } | null;
  onClose?: () => void;
}

function Trophy() {
  return (
    <svg className="gover__cup" viewBox="0 0 120 120" width="112" height="112" aria-hidden="true">
      <defs>
        <linearGradient id="cupGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe7a6" />
          <stop offset="0.5" stopColor="#e2b04a" />
          <stop offset="1" stopColor="#a9781f" />
        </linearGradient>
      </defs>
      {/* ручки */}
      <path d="M30 30 H20 a14 14 0 0 0 14 14 v-6 a8 8 0 0 1 -8 -8z" fill="url(#cupGold)" stroke="#8a5f18" strokeWidth="1.5" />
      <path d="M90 30 H100 a14 14 0 0 1 -14 14 v-6 a8 8 0 0 0 8 -8z" fill="url(#cupGold)" stroke="#8a5f18" strokeWidth="1.5" />
      {/* чаша */}
      <path d="M32 22 H88 V40 a28 28 0 0 1 -56 0 Z" fill="url(#cupGold)" stroke="#8a5f18" strokeWidth="2" />
      {/* ножка + основание */}
      <rect x="55" y="66" width="10" height="16" fill="url(#cupGold)" stroke="#8a5f18" strokeWidth="1.5" />
      <rect x="42" y="82" width="36" height="8" rx="2" fill="url(#cupGold)" stroke="#8a5f18" strokeWidth="1.5" />
      <rect x="36" y="90" width="48" height="9" rx="3" fill="url(#cupGold)" stroke="#8a5f18" strokeWidth="1.5" />
      {/* звезда */}
      <path d="M60 28 l3.2 6.5 7.2 1 -5.2 5 1.2 7.1 -6.4 -3.4 -6.4 3.4 1.2 -7.1 -5.2 -5 7.2 -1z" fill="#fff6dd" opacity="0.9" />
    </svg>
  );
}

export default function GameOverModal({
  won, subtitle, rating, onLobby, onAgain, againLabel = 'Сыграть ещё', extra, onClose,
}: GameOverModalProps) {
  // Один раз при показе модалки победы: звук победы + пауза фоновой музыки.
  useEffect(() => {
    if (won) { pauseMusic(); playVictory(); }
  }, [won]);

  return (
    <Modal className={'gover' + (won ? ' gover--win' : '')} onClose={onClose}>
      {won && <Trophy />}
      <h2 className="gover__title">{won ? 'Победа!' : 'Партия завершена'}</h2>
      <p className="gover__subtitle">{subtitle}</p>

      {won && rating && (
        <div className="gover__rating">
          <span className="gover__rating-label">Ваш рейтинг</span>
          <span className="gover__rating-val">
            {rating.after}
            <span className="gover__rating-delta">
              {rating.delta >= 0 ? `+${rating.delta}` : rating.delta}
            </span>
          </span>
        </div>
      )}

      <div className="gover__actions">
        {onAgain && <button className="btn btn--primary" onClick={onAgain}>{againLabel}</button>}
        {extra && <button className="btn" onClick={extra.onClick}>{extra.label}</button>}
        <button className="btn" onClick={onLobby}>ЛОББИ</button>
      </div>
    </Modal>
  );
}
