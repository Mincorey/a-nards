/* =============================================================================
 * Modal.tsx — универсальный оверлей модалки. Раньше модалки нельзя было закрыть
 * ничем, кроме как «пройти» их (нет кнопки закрытия, клик по фону не работал,
 * Esc не работал) — пользователь застревал. Теперь: если передан onClose,
 * модалку можно закрыть крестиком, кликом по тёмному фону или клавишей Esc.
 * Если onClose не передан — модалка «обязательная» (например, специально не
 * должна закрываться без выбора действия) и ведёт себя как раньше.
 *
 * Рендерим через createPortal прямо в document.body. Раньше модалка рисовалась
 * там же, где её вызвали в дереве компонентов — и если это было внутри
 * .app__header (например, ConfirmModal выхода из аккаунта, вызванный из
 * ProfileMenu.tsx), она «съезжала» в маленький угол шапки вместо центра экрана.
 * Причина: у .app__header есть backdrop-filter, а backdrop-filter/filter/
 * transform/perspective на предке создают собственный containing block для
 * потомков с position:fixed — оверлей (position:fixed;inset:0) начинал
 * позиционироваться не относительно всего окна, а относительно крошечной
 * шапки. Портал в body полностью убирает эту зависимость от места вызова —
 * так модалка всегда корректно центрируется по всему экрану, независимо от
 * того, где именно в дереве её открыли.
 *
 * Защита от «сквозного» тапа (ghost click). На мобильных после касания браузер
 * дорассылает синтетические mouse-события (mousedown/mouseup/click) уже ПОСЛЕ
 * touchend. Если модалка смонтировалась синхронно в ответ на этот же тап
 * (пример: тап по лотку выноса снимает ПОСЛЕДНЮЮ шашку → мгновенно открывается
 * модалка победы), «хвост» того же тапа прилетал в только что открытый оверлей:
 * mousedown попадал в тёмный фон → onClose → модалка исчезала за долю секунды
 * (наблюдалось в партии с ботом). Поэтому первые ARM_DELAY_MS после
 * монтирования оверлей вовсе не принимает указательные события
 * (pointer-events: none) и дополнительно игнорирует клик по фону. Esc работает
 * сразу — клавиатуры «хвост» тапа не касается.
 * ========================================================================== */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Первые N мс после открытия модалка «не взведена»: не ловит клики/тапы. */
const ARM_DELAY_MS = 400;

export interface ModalProps {
  onClose?: () => void;
  className?: string;
  children: ReactNode;
}

export default function Modal({ onClose, className = '', children }: ModalProps) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose!();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      style={armed ? undefined : { pointerEvents: 'none' }}
      onMouseDown={(e) => {
        if (armed && onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={'modal__card ' + className}>
        {onClose && (
          <button type="button" className="modal__close" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
