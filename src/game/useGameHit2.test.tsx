// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGame, type GameSnapshot } from './useGame';
import type { GameState } from '../engine/types';

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

// Белые ВСЕ в доме. Удар в доме, затем ВЫНОС той же шашкой оставшимся кубиком.
function craft(): GameState {
  const pts = new Array(24).fill(0);
  pts[3] = 1;    // белая-атакующая (дом)
  pts[1] = 13;   // остальные белые (дом)
  pts[0] = -1;   // чёрный блот на 0 (дом белых)
  pts[18] = -14; // чёрные
  return { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn: 'w', dice: [3, 1], rolled: [3, 1], variant: 'short' } as GameState;
}

describe('UI-путь: удар в доме + вынос той же шашкой', () => {
  it('после 3->0 (бой) шашка на 0 выносится кубиком 1', () => {
    const initial: GameSnapshot = {
      game: craft(), phase: 'humanMove', message: '', winner: null, rollId: 1,
    };
    const { result } = renderHook(() => useGame('w', 'medium', 'short', undefined, initial));
    act(() => result.current.pick(3));
    act(() => result.current.pick(0));  // удар 3->0 (die 3)
    expect(result.current.game.pts[0]).toBe(1);
    expect(result.current.game.bar.b).toBe(1);
    expect(result.current.game.dice).toEqual([1]);
    // Продолжаем той же шашкой — вынос 0 -> off
    expect(result.current.sources.has(0)).toBe(true);
    act(() => result.current.pick(0));
    expect(result.current.selected).toBe(0);
    act(() => result.current.pick('off'));
    expect(result.current.game.off.w).toBe(1);
    expect(result.current.game.pts[0]).toBe(0);
  });
});
