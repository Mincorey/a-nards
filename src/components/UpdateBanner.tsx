/* =============================================================================
 * UpdateBanner — реакция на выход нового деплоя (useVersionCheck).
 *
 * Две ветки поведения:
 *  1) Баннер. Как только найдена новая версия — снизу всплывает ненавязчивый
 *     баннер «Доступна новая версия → Обновить / Позже». Пользователь всегда
 *     может обновиться вручную или отложить.
 *  2) Авто-reload при простое. Параллельно следим, «занят» ли пользователь.
 *     Если партия НЕ идёт (guard.active) И пользователь давно ничего не трогал
 *     (IDLE_MS) ИЛИ вкладка свёрнута — тихо перезагружаем страницу сами, чтобы
 *     человек не застрял на старой версии. Это безопасные моменты: на свёрнутой
 *     вкладке reload незаметен, а при простое он ничего не печатал/не заполнял.
 *
 * Клик «Позже» = пользователь осознанно остаётся на старой версии → отменяем и
 * авто-reload тоже (не дёргаем его против воли).
 * ========================================================================== */
import { useEffect, useRef, useState } from 'react';
import { useVersionCheck } from '../lib/useVersionCheck';
import { useNavGuardRef } from '../lib/navGuard';

const IDLE_MS = 60 * 1000; // сколько пользователь должен «простаивать» до авто-reload
const WATCH_MS = 5 * 1000; // как часто проверяем условия простоя

export default function UpdateBanner() {
  const updateAvailable = useVersionCheck();
  const guard = useNavGuardRef();
  const [dismissed, setDismissed] = useState(false);
  const lastActivityRef = useRef(Date.now());

  // Авто-reload при простое. Работает, только пока висит баннер (новая версия
  // найдена и пользователь её не отложил).
  useEffect(() => {
    if (!updateAvailable || dismissed) return;

    const bump = () => { lastActivityRef.current = Date.now(); };
    // Любое из этих событий = пользователь активен.
    const events: (keyof WindowEventMap)[] = [
      'pointerdown', 'keydown', 'mousemove', 'wheel', 'touchstart', 'scroll',
    ];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivityRef.current >= IDLE_MS;
      const hidden = document.visibilityState === 'hidden';
      // Перезагружаем только вне партии и только в «спокойный» момент.
      if (!guard.active.current && (idle || hidden)) {
        window.location.reload();
      }
    }, WATCH_MS);

    return () => {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [updateAvailable, dismissed, guard]);

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span className="update-banner__text">Доступна новая версия приложения</span>
      <div className="update-banner__actions">
        <button
          type="button"
          className="update-banner__btn update-banner__btn--primary"
          onClick={() => window.location.reload()}
        >
          Обновить
        </button>
        <button
          type="button"
          className="update-banner__btn"
          onClick={() => setDismissed(true)}
        >
          Позже
        </button>
      </div>
    </div>
  );
}
