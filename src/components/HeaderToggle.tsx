/* =============================================================================
 * HeaderToggle.tsx — обёртка над шапкой сайта. На обычных экранах и в портретной
 * мобильной ориентации ведёт себя как раньше (шапка всегда видна). Только в
 * мобильном ландшафте (низкий широкий экран) шапка прячется, чтобы доска
 * помещалась по высоте без прокрутки, а вместо неё сверху по центру появляется
 * маленькая стрелочка — по тапу шапка красиво выезжает сверху.
 * Открытая шапка сама скрывается через 5с без взаимодействия — чтобы не
 * закрывать доску, если про неё забыли. Любой тап внутри шапки сбрасывает
 * таймер (пользователь ей ещё пользуется).
 * Вся логика показа/скрытия — в CSS через медиа-запрос; здесь только состояние
 * open/closed и разметка.
 * ========================================================================== */
import { useEffect, useRef, useState, type ReactNode } from 'react';

const AUTO_HIDE_MS = 5000;

export default function HeaderToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
  };
  const armTimer = () => {
    clearTimer();
    timerRef.current = window.setTimeout(() => setOpen(false), AUTO_HIDE_MS);
  };

  useEffect(() => {
    if (open) armTimer(); else clearTimer();
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="header-toggle"
        aria-label={open ? 'Скрыть меню' : 'Показать меню'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={'header-toggle__arrow' + (open ? ' is-open' : '')}>▾</span>
      </button>
      <header
        className={'app__header' + (open ? ' is-open' : '')}
        onPointerDown={open ? armTimer : undefined}
      >
        {children}
      </header>
      {open && <div className="header-toggle__scrim" onClick={() => setOpen(false)} />}
    </>
  );
}
