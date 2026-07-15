// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGame, type GameSnapshot } from './useGame';
import type { GameState } from '../engine/types';

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

// Белые: 14 уже вынесено, 1 на пункте 0 (дом), кубик 1 → вынос последней = победа.
function craftWin(): GameState {
  const pts = new Array(24).fill(0);
  pts[0] = 1;       // последняя белая в доме
  pts[23] = -15;    // чёрные (не важно где)
  return { pts, bar: { w: 0, b: 0 }, off: { w: 14, b: 0 }, turn: 'w', dice: [1, 3], rolled: [1, 3], variant: 'short' } as GameState;
}

describe('Игра с ботом: модалка завершения появляется при победе', () => {
  it('вынос последней шашки → phase=gameover, winner=w', () => {
    const initial: GameSnapshot = {
      game: craftWin(), phase: 'humanMove', message: 'Выберите шашку и ход', winner: null, rollId: 1,
    };
    const { result } = renderHook(() => useGame('w', 'medium', 'short', undefined, initial));
    expect(result.current.phase).toBe('humanMove');
    act(() => result.current.pick(0));       // выбрали шашку
    act(() => result.current.pick('off'));   // вынесли
    expect(result.current.game.off.w).toBe(15);
    expect(result.current.phase).toBe('gameover');
    expect(result.current.winner).toBe('w');
  });
});
