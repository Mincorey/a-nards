/* =============================================================================
 * ContactsPage — форма обратной связи. Отправляет сообщение администратору в
 * Telegram через Edge Function `send-contact` (токен бота живёт на сервере).
 * Антиспам на клиенте: honeypot-поле + метка времени открытия формы; основная
 * защита — на сервере (см. supabase/functions/send-contact).
 * ========================================================================== */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { IconChevron } from '../components/icons';

const TOPICS = [
  'Вопрос по игре',
  'Проблема с пополнением',
  'Проблема с выводом средств',
  'Технический сбой / нашёл баг',
  'Предложение по улучшению',
  'Другое',
];

const MSG_MAX = 2000;
type Status = 'idle' | 'sending' | 'ok' | 'error';

export default function ContactsPage() {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState(''); // honeypot — люди не видят это поле
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const openedAt = useRef<number>(Date.now());
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Закрытие выпадающего списка по клику вне и по Escape.
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

  const canSend = name.trim().length >= 2 && topic !== '' && message.trim().length >= 10 && status !== 'sending';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setStatus('sending'); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('send-contact', {
        body: {
          name: name.trim(),
          topic,
          message: message.trim(),
          company,                              // honeypot
          elapsed: Date.now() - openedAt.current,
        },
      });
      if (fnErr) {
        const ctx = (fnErr as { context?: { body?: unknown } }).context;
        const msg = (data as { error?: string } | null)?.error
          || (typeof ctx?.body === 'string' ? ctx.body : '')
          || fnErr.message;
        throw new Error(msg);
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setStatus('ok');
      setName(''); setTopic(''); setMessage('');
      openedAt.current = Date.now();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Не удалось отправить сообщение');
    }
  }

  return (
    <section className="legal">
      <Link className="btn btn--back" to="/">← На главную</Link>
      <div className="card legal__card">
        <h1 className="page__title">Контакты</h1>
        <p>
          Есть вопрос, предложение или нашли баг — напишите нам через форму ниже,
          будем рады обратной связи.
        </p>

        {status === 'ok' ? (
          <div className="cform__done">
            <p className="auth__info">Сообщение отправлено! Спасибо за обратную связь — мы ответим при необходимости.</p>
            <button className="btn" type="button" onClick={() => setStatus('idle')}>Написать ещё</button>
          </div>
        ) : (
          <form className="cform" onSubmit={onSubmit} noValidate>
            <label className="field">
              <span>Ваше имя</span>
              <input
                type="text" value={name} maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="Как к вам обращаться"
                autoComplete="name"
              />
            </label>

            <div className="field">
              <span>Тема сообщения</span>
              <div className={'cform__picker' + (open ? ' is-open' : '')} ref={pickerRef}>
                <button
                  type="button" className="cform__trigger"
                  aria-haspopup="listbox" aria-expanded={open}
                  onClick={() => setOpen((v) => !v)}
                >
                  <span className={topic ? '' : 'cform__placeholder'}>{topic || 'Выберите тему…'}</span>
                  <IconChevron className="cform__chevron" />
                </button>
                {open && (
                  <ul className="cform__menu" role="listbox">
                    {TOPICS.map((t) => (
                      <li key={t}>
                        <button
                          type="button" role="option" aria-selected={topic === t}
                          className={'cform__option' + (topic === t ? ' is-sel' : '')}
                          onClick={() => { setTopic(t); setOpen(false); }}
                        >
                          {t}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <label className="field">
              <span>Сообщение</span>
              <textarea
                className="cform__textarea" value={message} maxLength={MSG_MAX} rows={5}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Опишите вопрос или проблему как можно подробнее — так мы разберёмся быстрее."
              />
              <span className="cform__counter">{message.length} / {MSG_MAX}</span>
            </label>

            {/* Honeypot: скрыт от людей, ловит ботов-автозаполнителей. */}
            <div className="cform__hp" aria-hidden="true">
              <label>
                Компания
                <input
                  type="text" tabIndex={-1} autoComplete="off"
                  value={company} onChange={(e) => setCompany(e.target.value)}
                />
              </label>
            </div>

            {status === 'error' && <p className="auth__error" role="alert">{error}</p>}

            <button className="btn btn--primary" type="submit" disabled={!canSend}>
              {status === 'sending' ? 'Отправка…' : 'Отправить'}
            </button>
          </form>
        )}

        <p className="legal__hint cform__admin">
          Для прямого обращения к администратору сайта пишите в Telegram:{' '}
          <a className="legal__mail" href="https://t.me/Mincorey" target="_blank" rel="noopener noreferrer">@Mincorey</a>
        </p>
      </div>
    </section>
  );
}
