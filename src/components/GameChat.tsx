/* =============================================================================
 * GameChat.tsx — Окно чата ПОД ДОСКОЙ (портрет/десктоп). Управляемый компонент:
 * список сообщений и отправка приходят сверху (см. game/chat.ts, useGameChat),
 * потому что в мобильном ландшафте те же сообщения показываются иначе
 * (иконка → модалка → облачко под аватаром), а источник данных общий.
 * Свободного ввода нет — фраза выбирается из КАСТОМНОГО выпадающего списка
 * (стилизован под сайт, не системный select).
 * ========================================================================== */
import { useEffect, useRef, useState } from 'react';
import { CHAT_PHRASES, type ChatMessage } from '../game/chat';
import { IconChevron } from './icons';

export interface GameChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  className?: string;
}

export default function GameChat({ messages, onSend, className = '' }: GameChatProps) {
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

  function pickPhrase(text: string) {
    onSend(text);
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
                <button type="button" className="gchat__option" role="option" aria-selected="false" onClick={() => pickPhrase(p)}>
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
