/* =============================================================================
 * BotGameSession.tsx — партия с ботом живёт здесь, ВНЕ страницы /play, в
 * контексте (подключён один раз в main.tsx). Переход по страницам её не трогает.
 * НОВОЕ:
 *  - Пауза: пока открыт любой оверлей (usePaused из pause.tsx) — игровой цикл
 *    замирает (см. pausedRef, передаётся в useGame).
 *  - Сохранение: снимок партии пишется в sessionStorage и восстанавливается при
 *    следующем монтировании провайдера — партия переживает поворот экрана /
 *    перезагрузку страницы (не «выкидывает» в настройки).
 * ========================================================================== */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useGame, type UseGame, type GameSnapshot } from './useGame';
import { SAVE_KEY, parsePersisted, serializePersisted, type Persisted } from './botSnapshot';
import { usePaused } from './pause';
import type { Difficulty } from './bot';
import type { Variant } from '../engine/types';

export interface BotGameSessionValue {
  variant: Variant;
  difficulty: Difficulty;
  setupOpen: boolean;
  started: boolean;
  /** Партия сейчас на паузе (открыт оверлей). */
  paused: boolean;
  openSetup: () => void;
  closeSetup: () => void;
  start: (variant: Variant, difficulty: Difficulty) => void;
  abandon: () => void;
  game: UseGame;
}

const Ctx = createContext<BotGameSessionValue | null>(null);

// Загрузка снимка: читаем строку из хранилища и валидируем версию/формат
// через botSnapshot.parsePersisted. Несовместимый или битый снимок — сбрасываем.
function loadPersisted(): Persisted | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  const parsed = parsePersisted(raw);
  if (raw && !parsed) {
    // Мусор/старая версия — убираем, чтобы не мешал.
    try { sessionStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
  return parsed;
}

export function BotGameSessionProvider({ children }: { children: ReactNode }) {
  // Читаем сохранённую партию один раз при монтировании.
  const [persisted] = useState<Persisted | null>(() => loadPersisted());
  // Восстанавливаем снимок только для НЕзавершённой начатой партии с закрытыми
  // настройками — иначе показываем настройки как обычно.
  const restoreSnap: GameSnapshot | null =
    persisted && persisted.started && !persisted.setupOpen ? persisted.snap : null;

  const [variant, setVariant] = useState<Variant>(persisted?.variant ?? 'short');
  const [difficulty, setDifficulty] = useState<Difficulty>(persisted?.difficulty ?? 'medium');
  const [setupOpen, setSetupOpen] = useState<boolean>(persisted ? persisted.setupOpen : true);
  const [startTick, setStartTick] = useState<number>(persisted?.started ? 1 : 0);

  // Пауза: держим актуальное значение в ref, чтобы асинхронные корутины
  // игрового цикла видели свежую паузу без переподписки.
  const paused = usePaused();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const game = useGame('w', difficulty, variant, pausedRef, restoreSnap);

  // startTick меняется только по «Начать игру» → пересобрать партию. Первый
  // прогон пропускаем, если партия восстановлена из снимка (иначе reset() сотрёт её).
  const skipStartReset = useRef(!!restoreSnap);
  useEffect(() => {
    if (skipStartReset.current) { skipStartReset.current = false; return; }
    if (startTick > 0) game.reset();
  }, [startTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback((v: Variant, d: Difficulty) => {
    setVariant(v);
    setDifficulty(d);
    setSetupOpen(false);
    setStartTick((t) => t + 1);
  }, []);

  const openSetup = useCallback(() => setSetupOpen(true), []);
  const closeSetup = useCallback(() => setSetupOpen(false), []);

  const abandon = useCallback(() => {
    setSetupOpen(true);
    game.reset();
  }, [game]);

  // Сохраняем снимок партии в sessionStorage при любых значимых изменениях.
  useEffect(() => {
    const data = serializePersisted({
      variant, difficulty, started: startTick > 0, setupOpen,
      snap: {
        game: game.game, phase: game.phase, message: game.message,
        winner: game.winner, rollId: game.rollId,
      },
    });
    try { sessionStorage.setItem(SAVE_KEY, data); } catch { /* quota — не критично */ }
  }, [variant, difficulty, startTick, setupOpen, game.game, game.phase, game.message, game.winner, game.rollId]);

  return (
    <Ctx.Provider value={{
      variant, difficulty, setupOpen, started: startTick > 0, paused,
      openSetup, closeSetup, start, abandon, game,
    }}>
      {children}
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBotGameSession(): BotGameSessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBotGameSession must be used within BotGameSessionProvider');
  return v;
}
