/* =============================================================================
 * pause.tsx — глобальная «пауза» партии с ботом, пока открыт любой оверлей
 * (меню профиля, модалка настроек, уведомления, диалоги подтверждения).
 * Пока счётчик открытых оверлеев > 0 — paused=true: игровой цикл (useGame)
 * не двигает ходы бота и замораживает таймеры. Как только все окна закрыты —
 * счётчик 0, игра продолжается с того же места.
 * ========================================================================== */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';

interface PauseValue {
  paused: boolean;
  pushOverlay: () => void;
  popOverlay: () => void;
}

const Ctx = createContext<PauseValue>({
  paused: false, pushOverlay: () => {}, popOverlay: () => {},
});

export function PauseProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const pushOverlay = useCallback(() => setCount((c) => c + 1), []);
  const popOverlay = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);
  const value = useMemo(
    () => ({ paused: count > 0, pushOverlay, popOverlay }),
    [count, pushOverlay, popOverlay],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Пока open=true — регистрирует открытый оверлей (ставит игру на паузу). */
// eslint-disable-next-line react-refresh/only-export-components
export function useOverlay(open: boolean) {
  const { pushOverlay, popOverlay } = useContext(Ctx);
  useEffect(() => {
    if (!open) return;
    pushOverlay();
    return () => popOverlay();
  }, [open, pushOverlay, popOverlay]);
}

/** Текущее состояние паузы (для игрового цикла и визуальной заморозки таймеров). */
// eslint-disable-next-line react-refresh/only-export-components
export function usePaused(): boolean {
  return useContext(Ctx).paused;
}
