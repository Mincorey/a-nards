/* =============================================================================
 * GameOverModal.tsx — Модалка завершения партии (победа/поражение).
 * Победа: золотой кубок, звук победы (victory.mp3), пауза фоновой музыки,
 * (для онлайна) изменение рейтинга.
 * Поражение: отдельная «серебристо-угасшая» иконка (наклонённый кубок с
 * трещиной), заголовок «Поражение» и (для онлайна) изменение рейтинга —
 * оформлено в том же стиле, но в холодной гамме. Звук победы НЕ играет,
 * фоновую музыку тоже приглушаем.
 * Кнопка «ЛОББИ» уводит на главную страницу.
 * ========================================================================== */
import { useEffect } from 'react';
import Modal from './Modal';
import { playVictory } from '../lib/sound';
import { pauseMusic } from '../lib/music';

export interface GameOverModalProps {
  won: boolean;
  /** Подзаголовок под заголовком (например «Бот вынес все шашки первым»). */
  subtitle?: string;
  /** Онлайн: изменение рейтинга (после партии). Для игры с ботом — null/undefined. */
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

/** Иконка поражения — угасший наклонённый кубок с трещиной, в холодной гамме. */
function DefeatCup() {
  return (
    <svg className="gover__cup gover__cup--loss" viewBox="0 0 120 120" width="112" height="112" aria-hidden="true">
      <defs>
        <linearGradient id="cupGrey" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9cfd6" />
          <stop offset="0.5" stopColor="#8b95a1" />
          <stop offset="1" stopColor="#5a636e" />
        </linearGradient>
      </defs>
      {/* Слегка наклонённый кубок (побеждённый). */}
      <g transform="rotate(-8 60 60)">
        <path d="M30 30 H20 a14 14 0 0 0 14 14 v-6 a8 8 0 0 1 -8 -8z" fill="url(#cupGrey)" stroke="#4a525c" strokeWidth="1.5" />
        <path d="M90 30 H100 a14 14 0 0 1 -14 14 v-6 a8 8 0 0 0 8 -8z" fill="url(#cupGrey)" stroke="#4a525c" strokeWidth="1.5" />
        <path d="M32 22 H88 V40 a28 28 0 0 1 -56 0 Z" fill="url(#cupGrey)" stroke="#4a525c" strokeWidth="2" />
        <rect x="55" y="66" width="10" height="16" fill="url(#cupGrey)" stroke="#4a525c" strokeWidth="1.5" />
        <rect x="42" y="82" width="36" height="8" rx="2" fill="url(#cupGrey)" stroke="#4a525c" strokeWidth="1.5" />
        <rect x="36" y="90" width="48" height="9" rx="3" fill="url(#cupGrey)" stroke="#4a525c" strokeWidth="1.5" />
        {/* трещина по чаше */}
        <path d="M60 22 l-5 8 6 5 -6 6" fill="none" stroke="#3c434c" strokeWidth="2.2" strokeLinejoin="round" opacity="0.85" />
      </g>
    </svg>
  );
}

export default function GameOverModal({
  won, subtitle, rating, onLobby, onAgain, againLabel = 'Сыграть ещё', extra, onClose,
}: GameOverModalProps) {
  // При показе модалки: пауза фоновой музыки всегда; звук победы — только при выигрыше.
  useEffect(() => {
    pauseMusic();
    if (won) playVictory();
  }, [won]);

  return (
    <Modal className={'gover ' + (won ? 'gover--win' : 'gover--loss')} onClose={onClose}>
      {won ? <Trophy /> : <DefeatCup />}
      <h2 className="gover__title">{won ? 'Победа!' : 'Поражение'}</h2>
      {subtitle && <p className="gover__subtitle">{subtitle}</p>}

      {rating && (
        <div className="gover__rating">
          <span className="gover__rating-label">Ваш рейтинг</span>
          <span className="gover__rating-val">
            {rating.after}
            <span className={'gover__rating-delta' + (rating.delta < 0 ? ' is-neg' : '')}>
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
