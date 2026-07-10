/* =============================================================================
 * navGuard.tsx — общий «стоп-кран» для навигации во время активной партии.
 * Раньше кнопки/модалки выхода подтверждались (ConfirmModal), но переход по
 * ссылкам верхнего меню (Главная/Лобби/Профиль и т.д.) во время игры происходил
 * мгновенно, без вопроса — пользователь мог случайно потерять партию.
 * Страница с активной игрой вызывает useRegisterNavGuard(true, onLeave), пока
 * партия идёт; App.tsx (и ProfileMenu на мобильном) перед переходом проверяет
 * флаг и при необходимости показывает подтверждение вместо мгновенного
 * перехода. После подтверждения вызывается onLeave() — страница может
 * почистить за собой состояние (например, полностью сбросить партию с ботом,
 * чтобы «Игра» открыла настройки заново, а не старую партию — см.
 * BotGameSession.tsx: abandon()).
 * Всё хранится в ref (не в state) — читать нужно только В МОМЕНТ клика, а не
 * подписываться на изменения, поэтому лишний ре-рендер тут не нужен.
 * ========================================================================== */
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

export interface NavGuard {
  active: { current: boolean };
  onLeave: { current: (() => void) | null };
}

function makeFallback(): NavGuard {
  return { active: { current: false }, onLeave: { current: null } };
}

const Ctx = createContext<NavGuard>(makeFallback());

export function NavGuardProvider({ children }: { children: ReactNode }) {
  const active = useRef(false);
  const onLeave = useRef<(() => void) | null>(null);
  return <Ctx.Provider value={{ active, onLeave }}>{children}</Ctx.Provider>;
}

/** Страница вызывает на каждом рендере: isActive=true — сейчас идёт партия,
 * уходить без подтверждения нельзя; onLeave — необязательный колбэк, который
 * сработает ПОСЛЕ подтверждения ухода (до самого перехода) — удобно, чтобы
 * полностью сбросить состояние партии, а не просто уйти со страницы. */
// eslint-disable-next-line react-refresh/only-export-components
export function useRegisterNavGuard(isActive: boolean, onLeave?: () => void) {
  const ctx = useContext(Ctx);
  useEffect(() => {
    ctx.active.current = isActive;
    ctx.onLeave.current = isActive ? (onLeave ?? null) : null;
    return () => { ctx.active.current = false; ctx.onLeave.current = null; };
  }, [isActive, onLeave, ctx]);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNavGuardRef(): NavGuard {
  return useContext(Ctx);
}
