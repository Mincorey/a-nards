/* =============================================================================
 * PlayerPanel.tsx — Панель игрока сбоку от доски: круглый аватар с кольцом
 * таймера хода, ник. Кольцо истощается, пока ход этого игрока.
 * note — необязательное уведомление о ходе игры; в мобильном ландшафте (см. CSS)
 * показывается бабблом над аватаром именно этого игрока.
 * ========================================================================== */
import type { Color } from '../engine/types';

export interface PlayerPanelProps {
  name: string;
  color: Color;
  avatarUrl?: string | null;
  active?: boolean;          // сейчас ход этого игрока
  turnKey?: number | string; // меняется при смене хода → перезапуск кольца
  seconds?: number;          // длительность таймера, сек
  you?: boolean;
  /** Онлайн-статус реального игрока. Для бота не передаём вовсе (undefined). */
  online?: boolean;
  /** Уведомление о ходе игры (в ландшафте — баббл над аватаром). */
  note?: string | null;
  className?: string;
}

const R = 46;
const C = 2 * Math.PI * R;

export default function PlayerPanel({
  name, color, avatarUrl, active, turnKey, seconds = 45, you, online, note, className = '',
}: PlayerPanelProps) {
  const initial = (name || '?').trim().slice(0, 1).toUpperCase();
  return (
    <div className={'pp ' + className + (active ? ' is-active' : '')}>
      {note ? <div className="pp__note">{note}</div> : null}
      <div className="pp__ring">
        <svg viewBox="0 0 108 108" className="pp__ring-svg" aria-hidden="true">
          <circle className="pp__ring-bg" cx="54" cy="54" r={R} />
          {active && (
            <circle
              key={turnKey}
              className="pp__ring-fg"
              cx="54" cy="54" r={R}
              strokeDasharray={C}
              style={{ animationDuration: `${seconds}s` }}
            />
          )}
        </svg>
        <div className={'pp__avatar pp__avatar--' + color}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="pp__ph">{initial}</span>}
        </div>
        {online != null && (
          <span
            className={'pp__online' + (online ? ' is-on' : '')}
            title={online ? 'В сети' : 'Не в сети'}
          />
        )}
      </div>
      <div className="pp__name">{name}{you ? ' (вы)' : ''}</div>
    </div>
  );
}
