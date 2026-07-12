/* =============================================================================
 * PlayerPanel.tsx — Панель игрока сбоку от доски: круглый аватар с кольцом
 * таймера хода, ник. Кольцо истощается, пока ход этого игрока.
 * Кнопки (для локального игрока): выход (onFinish) → чат (onChat) → настройки
 * (onSettings), сверху вниз. Кнопка чата видна ТОЛЬКО в мобильном ландшафте
 * (управляется CSS) — там окно чата под доской убрано ради места, и фраза
 * выбирается через модалку, всплывая облачком под аватаром (chatBubble).
 * note — уведомление о ходе (в ландшафте — баббл НАД аватаром).
 * ========================================================================== */
import { useEffect, useState } from 'react';
import type { Color } from '../engine/types';
import { IconGear, IconExit, IconChat } from './icons';

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
  /** Если задан и you=true — показывает шестерёнку настроек над аватаром. */
  onSettings?: () => void;
  /** Если задан и you=true — показывает кнопку выхода из партии НАД шестерёнкой. */
  onFinish?: () => void;
  /** Если задан и you=true — показывает кнопку чата (между выходом и настройками);
   *  видна только в мобильном ландшафте (см. CSS). */
  onChat?: () => void;
  /** Последнее отправленное сообщение — всплывает облачком под аватаром (ландшафт). */
  chatBubble?: { id: string | number; text: string } | null;
  className?: string;
}

const R = 46;
const C = 2 * Math.PI * R;

export default function PlayerPanel({
  name, color, avatarUrl, active, turnKey, seconds = 45, you, online, note,
  onSettings, onFinish, onChat, chatBubble, className = '',
}: PlayerPanelProps) {
  const initial = (name || '?').trim().slice(0, 1).toUpperCase();

  // Облачко чата под аватаром: показываем последнее сообщение и прячем через ~6с.
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  useEffect(() => {
    if (!chatBubble) return;
    setBubbleText(chatBubble.text);
    const t = window.setTimeout(() => setBubbleText(null), 6000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatBubble?.id]);

  return (
    <div className={'pp ' + className + (active ? ' is-active' : '')}>
      {you && onFinish && (
        <button
          type="button"
          className="pp__finish"
          onClick={onFinish}
          aria-label="Завершить игру"
          title="Завершить игру"
        >
          <IconExit />
        </button>
      )}
      {you && onChat && (
        <button
          type="button"
          className="pp__chat"
          onClick={onChat}
          aria-label="Сообщение"
          title="Сообщение"
        >
          <IconChat />
        </button>
      )}
      {you && onSettings && (
        <button
          type="button"
          className="pp__gear"
          onClick={onSettings}
          aria-label="Настройки игры"
          title="Настройки игры"
        >
          <IconGear />
        </button>
      )}
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
      {bubbleText && <div className="pp__chat-bubble">{bubbleText}</div>}
    </div>
  );
}
