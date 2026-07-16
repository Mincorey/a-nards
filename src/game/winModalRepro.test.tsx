// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { useGame, type GameSnapshot, type UseGame } from './useGame';
import type { GameState } from '../engine/types';

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

/** Мини-копия gating из BotGame.tsx: модалка при phase==='gameover' && !overDismissed. */
function Harness({ initial, onGame }: { initial: GameSnapshot; onGame: (g: UseGame) => void }) {
  const g = useGame('w', 'medium', initial.game.variant ?? 'short', undefined, initial);
  const [overDismissed, setOverDismissed] = useState(false);
  useEffect(() => { if (g.phase !== 'gameover') setOverDismissed(false); }, [g.phase]);
  useEffect(() => { onGame(g); });
  return (
    <div>
      <span data-testid="phase">{g.phase}</span>
      {g.phase === 'gameover' && !overDismissed && (
        <div role="dialog"><h2>{g.winner === 'w' ? 'Победа!' : 'Поражение'}</h2></div>
      )}
    </div>
  );
}

// Две белые в доме (13 вынесено): пункт1(pip2) и пункт0(pip1). Кубики [2,1].
function twoLeft(): GameState {
  const pts = new Array(24).fill(0);
  pts[1] = 1; pts[0] = 1;
  pts[23] = -13; pts[22] = -2; // чёрные где угодно, всего 15
  return { pts, bar: { w: 0, b: 0 }, off: { w: 13, b: 0 }, turn: 'w', dice: [2, 1], rolled: [2, 1], variant: 'short' } as GameState;
}

describe('Модалка победы (bot gating) — реалистичный доигрыш', () => {
  it('вынос двух шашок за ход [2,1] → «Победа!» появляется и НЕ исчезает после таймеров', () => {
    vi.useFakeTimers();
    let gref: UseGame | null = null;
    const initial: GameSnapshot = { game: twoLeft(), phase: 'humanMove', message: '', winner: null, rollId: 1 };
    render(<Harness initial={initial} onGame={(g) => { gref = g; }} />);

    // Ход 1: снять шашку с пункта 1 (die 2)
    act(() => { gref!.pick(1); });
    act(() => { gref!.pick('off'); });
    // Ход 2: снять последнюю с пункта 0 (die 1) → победа
    act(() => { gref!.pick(0); });
    act(() => { gref!.pick('off'); });

    expect(gref!.game.off.w).toBe(15);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Победа!')).toBeTruthy();

    // Прогоняем ВСЕ отложенные таймеры (стоп-тест на «протухший» endHuman → botTurn).
    act(() => { vi.runAllTimers(); });
    expect(screen.getByText('Победа!')).toBeTruthy();
    expect(screen.getByTestId('phase').textContent).toBe('gameover');
    vi.useRealTimers();
  });
});
