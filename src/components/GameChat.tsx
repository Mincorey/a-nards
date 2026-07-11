/* =============================================================================
 * GameChat.tsx — Окно чата под доской с ЗАРАНЕЕ ПОДГОТОВЛЕННЫМИ фразами.
 * Свободного ввода нет — игрок выбирает фразу из КАСТОМНОГО выпадающего списка
 * (стилизован под дизайн сайта, а не системный select), и она появляется
 * облачком в ленте. Лента вмещает последние сообщения, прокручивается, у каждого
 * сообщения — маленький аватар отправителя. Пока фразы отправляет только
 * локальный игрок (тестовый набор); онлайн-синхронизация — отдельный шаг.
 * ========================================================================== */
import { useEffect, useRef, useState } from 'react';
import type { Color } from '../engine/types';
import { IconChevron } from './icons';

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
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Автопрокрутка к последнему сообщению.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Закрытие меню по клику вне и по Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function send(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: ++msgSeq, text, name: selfName, avatarUrl: selfAvatarUrl, color: selfColor },
    ]);
    setOpen(false);
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

      <div className={'gchat__picker' + (open ? ' is-open' : '')} ref={pickerRef}>
        {open && (
          <ul className="gchat__menu" role="listbox">
            {CHAT_PHRASES.map((p) => (
              <li key={p}>
                <button type="button" className="gchat__option" role="option" aria-selected="false" onClick={() => send(p)}>
                  {p}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="gchat__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span>Выберите сообщение…</span>
          <IconChevron className="gchat__chevron" />
        </button>
      </div>
    </div>
  );
}
