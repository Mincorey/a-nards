// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGame, type GameSnapshot } from './useGame';
import type { GameState } from '../engine/types';

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

function craft(): GameState {
  const pts = new Array(24).fill(0);
  pts[12] = 1;    // белая, которую двигаем цепочкой
  pts[6] = 13;    // прочие белые (в доме, не мешают)
  pts[23] = -15;  // чёрные
  return { pts, bar: { w: 0, b: 0 }, off: { w: 1, b: 0 }, turn: 'w', dice: [3, 2], rolled: [3, 2], variant: 'short' } as GameState;
}

describe('Игра с ботом: клик по конечной точке играет всю цепочку', () => {
  it('p12 выбрана, клик p7 → оба кубика применены за один клик', () => {
    const initial: GameSnapshot = {
      game: craft(), phase: 'humanMove', message: '', winner: null, rollId: 1,
    };
    const { result } = renderHook(() => useGame('w', 'medium', 'short', undefined, initial));
    act(() => result.current.pick(12));
    // среди целей должна быть конечная точка 7
    expect(result.current.targets.map((m) => m.to)).toContain(7);
    act(() => result.current.pick(7));
    expect(result.current.game.pts[12]).toBe(0);
    expect(result.current.game.pts[7]).toBe(1);
    expect(result.current.game.dice.length).toBe(0);
  });
});
