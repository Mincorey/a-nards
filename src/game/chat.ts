/* =============================================================================
 * chat.ts — Состояние игрового чата с заранее подготовленными фразами.
 * Состояние поднято сюда (а не внутрь GameChat), потому что фразы показываются
 * в ДВУХ местах в зависимости от раскладки:
 *   • портрет/десктоп — окно чата под доской (GameChat, список облачков);
 *   • мобильный ЛАНДШАФТ — иконка чата в стойке кнопок → модалка выбора фразы,
 *     а выбранное сообщение всплывает облачком под аватаром отправителя.
 * Оба варианта используют один и тот же источник сообщений и один send().
 * Пока отправляет только локальный игрок (тестовый набор фраз); онлайн-синхрон
 * между игроками — отдельный шаг.
 * ========================================================================== */
import { useCallback, useState } from 'react';
import type { Color } from '../engine/types';

/** Тестовый набор готовых фраз. Позже вынесем/расширим. */
export const CHAT_PHRASES: string[] = [
  'Вот бля...',
  'Охуеть - не встать!',
  'Пиздец',
];

export interface ChatMessage {
  id: number;
  text: string;
  name: string;
  avatarUrl?: string | null;
  color: Color;
}

export interface ChatSelf {
  name: string;
  avatarUrl?: string | null;
  color: Color;
}

let msgSeq = 0;

export interface UseGameChat {
  messages: ChatMessage[];
  /** Отправить фразу от локального игрока. */
  send: (text: string) => void;
  /** Последнее собственное сообщение (для облачка под аватаром в ландшафте). */
  lastSelf: ChatMessage | null;
}

export function useGameChat(self: ChatSelf): UseGameChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { name, avatarUrl, color } = self;
  const send = useCallback((text: string) => {
    if (!text) return;
    setMessages((prev) => [...prev, { id: ++msgSeq, text, name, avatarUrl, color }]);
  }, [name, avatarUrl, color]);
  const lastSelf = messages.length ? messages[messages.length - 1] : null;
  return { messages, send, lastSelf };
}
