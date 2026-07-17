/* =============================================================================
 * useVersionCheck — обнаружение нового деплоя без нагрузки на БД.
 *
 * Как работает:
 *  - при сборке в клиент зашивается __BUILD_ID__ (см. vite.config.ts);
 *  - рядом с сайтом лежит статический /version.json с тем же ID;
 *  - хук периодически (INTERVAL) и при возврате фокуса на вкладку запрашивает
 *    /version.json и сравнивает server-версию с зашитой. Не совпало — значит
 *    вышел новый деплой → updateAvailable = true.
 *
 * Почему это дёшево:
 *  - /version.json раздаётся с CDN Vercel как статика. Ни одного обращения к
 *    Supabase/БД. Файл ~50 байт, запрос идёт с cache:'no-store', но по сети
 *    это доли килобайта. Даже сотни открытых вкладок — это трафик Vercel
 *    (100 ГБ/мес на free), а не квоты Supabase.
 *
 * Осознанные решения:
 *  - интервал 5 минут — обновления не срочные; главный триггер это возврат
 *    фокуса на вкладку (пользователь вернулся — сразу проверили);
 *  - проверки по фокусу throttled: не чаще раза в 60 сек;
 *  - как только новая версия найдена — опрос прекращаем (больше незачем);
 *  - любые сетевые ошибки (офлайн, идёт деплой) молча игнорируем и пробуем
 *    в следующий раз.
 * ========================================================================== */
import { useEffect, useRef, useState } from 'react';

const INTERVAL_MS = 5 * 60 * 1000; // регулярная фоновая проверка — раз в 5 минут
const FOCUS_THROTTLE_MS = 60 * 1000; // не чаще раза в минуту при возврате фокуса

export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const lastCheckRef = useRef(0);
  const foundRef = useRef(false);

  useEffect(() => {
    // В dev version.json не генерируется — проверять нечего.
    if (import.meta.env.DEV) return;

    let cancelled = false;

    async function check() {
      if (foundRef.current || cancelled) return;
      lastCheckRef.current = Date.now();
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data: unknown = await res.json();
        const serverVersion =
          data && typeof data === 'object' && 'version' in data
            ? String((data as { version: unknown }).version)
            : null;
        if (!serverVersion) return;
        if (serverVersion !== __BUILD_ID__) {
          foundRef.current = true;
          window.clearInterval(timer);
          if (!cancelled) setUpdateAvailable(true);
        }
      } catch {
        // офлайн / деплой в процессе / битый ответ — просто ждём следующей попытки
      }
    }

    function onFocus() {
      if (Date.now() - lastCheckRef.current >= FOCUS_THROTTLE_MS) check();
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') onFocus();
    }

    const timer = window.setInterval(check, INTERVAL_MS);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return updateAvailable;
}
