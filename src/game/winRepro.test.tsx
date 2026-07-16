// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGame, type GameSnapshot } from './useGame';
import type { GameState, Variant } from '../engine/types';

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

// SHORT: 14 вынесено, 1 на пункте 0, но кубики [6,5] (не последняя цель одним кубиком,
// оба — вынос через перебор). Проверяем, что победа ловится при выносе.
function shortWin(dice: [number, number]): GameState {
  const pts = new Array(24).fill(0);
  pts[0] = 1;
  pts[23] = -15;
  return { pts, bar: { w: 0, b: 0 }, off: { w: 14, b: 0 }, turn: 'w', dice, rolled: dice, variant: 'short' } as GameState;
}

// LONG: белые дом 0..5. 14 вынесено, 1 на пункте 0 (dist 1), кубик выносит.
function longWin(dice: [number, number]): GameState {
  const pts = new Array(24).fill(0);
  pts[0] = 1;         // белая, dist=1
  pts[11] = -15;      // чёрные на голове
  return { pts, bar: { w: 0, b: 0 }, off: { w: 14, b: 0 }, turn: 'w', dice, rolled: dice, variant: 'long', headUsed: 0 } as GameState;
}

function driveToOff(state: GameState, variant: Variant) {
  const initial: GameSnapshot = {
    game: state, phase: 'humanMove', message: '', winner: null, rollId: 1,
  };
  const { result } = renderHook(() => useGame('w', 'medium', variant, undefined, initial));
  act(() => result.current.pick(0));      // выбрать шашку на пункте 0
  act(() => result.current.pick('off'));  // вынести
  return result;
}

describe('Репро: модалка победы над ботом (обе вариации, разные кубики)', () => {
  it('SHORT [1,3] → gameover', () => {
    const r = driveToOff(shortWin([1, 3]), 'short');
    expect(r.current.game.off.w).toBe(15);
    expect(r.current.phase).toBe('gameover');
    expect(r.current.winner).toBe('w');
  });
  it('SHORT [6,5] (вынос перебором) → gameover', () => {
    const r = driveToOff(shortWin([6, 5]), 'short');
    expect(r.current.game.off.w).toBe(15);
    expect(r.current.phase).toBe('gameover');
  });
  it('LONG [1,3] → gameover', () => {
    const r = driveToOff(longWin([1, 3]), 'long');
    expect(r.current.game.off.w).toBe(15);
    expect(r.current.phase).toBe('gameover');
    expect(r.current.winner).toBe('w');
  });
  it('LONG [6,5] (вынос перебором) → gameover', () => {
    const r = driveToOff(longWin([6, 5]), 'long');
    expect(r.current.game.off.w).toBe(15);
    expect(r.current.phase).toBe('gameover');
  });
});
