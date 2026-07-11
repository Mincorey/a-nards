/* =============================================================================
 * GameChat.tsx — Окно чата под доской с ЗАРАНЕЕ ПОДГОТОВЛЕННЫМИ фразами.
 * Свободного ввода нет — игрок выбирает фразу из выпадающего списка «Выберите
 * сообщение…», и она появляется облачком в ленте. Лента вмещает последние
 * сообщения (по ширине доски), прокручивается, у каждого сообщения — маленький
 * аватар отправителя. Пока фразы отправляет только локальный игрок (тестовый
 * набор); онлайн-синхронизация сообщений между игроками — отдельный шаг.
 * ========================================================================== */
import { useEffect, useRef, useState } from 'react';
import type { Color } from '../engine/types';

/** Тестовый набор готовых фраз. Позже вынесем/расширим. */
const CHAT_PHRASES: string[] = [
  'Вот бля...',
  'Охуеть - не встать!',
  'Пиздец',
];

let msgSeq = 0;

interface ChatMessage {
  id: number;
  text: string;
  name: string;
  avatarUrl?: string | null;
  color: Color;
}

export interface GameChatProps {
  /** Имя и аватар локального игрока (автор отправляемых фраз). */
  selfName: string;
  selfAvatarUrl?: string | null;
  selfColor: Color;
  className?: string;
}

export default function GameChat({ selfName, selfAvatarUrl, selfColor, className = '' }: GameChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pick, setPick] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // Автопрокрутка к последнему сообщению.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send(text: string) {
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: ++msgSeq, text, name: selfName, avatarUrl: selfAvatarUrl, color: selfColor },
    ]);
  }

  function onSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const text = e.target.value;
    if (text) send(text);
    setPick(''); // сбрасываем к плейсхолдеру
  }

  const initial = (n: string) => (n || '?').trim().slice(0, 1).toUpperCase();

  return (
    <div className={'gchat ' + className}>
      <div className="gchat__list" ref={listRef}>
        {messages.length === 0 ? (
          <p className="gchat__empty">Сообщений пока нет. Выберите фразу ниже.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="gchat__msg gchat__msg--self">
              <span className={'gchat__ava gchat__ava--' + m.color}>
                {m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : <span>{initial(m.name)}</span>}
              </span>
              <span className="gchat__bubble">{m.text}</span>
            </div>
          ))
        )}
      </div>
      <select className="gchat__select" value={pick} onChange={onSelect} aria-label="Выберите сообщение">
        <option value="">Выберите сообщение…</option>
        {CHAT_PHRASES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </div>
  );
}
