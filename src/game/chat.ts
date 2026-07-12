/* =============================================================================
 * chat.ts — Состояние игрового чата с заранее подготовленными фразами.
 * Состояние поднято сюда (а не внутрь GameChat), потому что фразы показываются
 * в ДВУХ местах в зависимости от раскладки:
 *   • портрет/десктоп — окно чата под доской (GameChat, список облачков);
 *   • мобильный ЛАНДШАФТ — иконка чата в стойке кнопок → модалка выбора фразы,
 *     а выбранное сообщение всплывает облачком под аватаром отправителя.
 * Оба варианта используют один и тот же источник сообщений и один send().
 *
 * ОНЛАЙН-СИНХРОН: если передан `transport`, отправленная фраза улетает оппоненту
 * (Supabase Realtime broadcast, см. lib/online.createChatChannel), а входящие
 * фразы оппонента добавляются в ленту с флагом own=false. В партии с ботом
 * transport не передаётся — чат остаётся локальным.
 * ========================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Color } from '../engine/types';

/** Готовые фразы для общения с оппонентом (эмодзи — обязательная часть фразы). */
export const CHAT_PHRASES: string[] = [
  'Вот фартовый!😒',
  'Сукаааа😯',
  'Аааааааа...🤬',
  'Да ну нах.',
  'Дал дал , ушёл 😂',
  'Раскучмачу сейчас тебя 😘',
  'Ладно ладно, твоя взяла 🤝',
  'Хорош Брух 👌',
  'Да пошёл ты 😂',
  'Вот ты зае.. 😂',
  'Внатуре так не честно',
  'Здарова Зае.. 😉',
  'Короче, иди н..',
];

/** Сообщение в ленте (own — своё сообщение, для выравнивания справа). */
export interface ChatMessage {
  id: string;
  text: string;
  name: string;
  avatarUrl?: string | null;
  color: Color;
  own: boolean;
}

/** Полезная нагрузка, улетающая по сети (без own — у каждого свой). */
export interface WireMessage {
  id: string;
  text: string;
  name: string;
  avatarUrl?: string | null;
  color: Color;
}

/** Транспорт онлайн-чата (реализация — Supabase broadcast). */
export interface ChatTransport {
  send: (m: WireMessage) => void;
  /** Подписка на входящие сообщения оппонента; возвращает функцию отписки. */
  subscribe: (cb: (m: WireMessage) => void) => () => void;
}

export interface ChatSelf {
  name: string;
  avatarUrl?: string | null;
  color: Color;
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseGameChat {
  messages: ChatMessage[];
  /** Отправить фразу от локального игрока (и разослать оппоненту, если онлайн). */
  send: (text: string) => void;
  /** Последнее СВОЁ сообщение (облачко под своим аватаром в ландшафте). */
  lastSelf: ChatMessage | null;
  /** Последнее сообщение ОППОНЕНТА (облачко под его аватаром в ландшафте). */
  lastOpponent: ChatMessage | null;
}

export function useGameChat(self: ChatSelf, transport?: ChatTransport): UseGameChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { name, avatarUrl, color } = self;
  const seenRef = useRef<Set<string>>(new Set());

  const append = useCallback((m: ChatMessage) => {
    setMessages((prev) => {
      if (seenRef.current.has(m.id)) return prev; // защита от дублей
      seenRef.current.add(m.id);
      return [...prev, m];
    });
  }, []);

  // Приём фраз оппонента по транспорту (онлайн).
  useEffect(() => {
    if (!transport) return;
    return transport.subscribe((w) => append({ ...w, own: false }));
  }, [transport, append]);

  const send = useCallback((text: string) => {
    if (!text) return;
    const id = genId();
    append({ id, text, name, avatarUrl, color, own: true });
    transport?.send({ id, text, name, avatarUrl, color });
  }, [name, avatarUrl, color, transport, append]);

  const lastSelf = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].own) return messages[i];
    return null;
  }, [messages]);
  const lastOpponent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (!messages[i].own) return messages[i];
    return null;
  }, [messages]);

  return { messages, send, lastSelf, lastOpponent };
}
