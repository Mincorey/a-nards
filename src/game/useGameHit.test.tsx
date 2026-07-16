// @vitest-environment jsdom
/* Интеграционный тест реального игрового пути UI (useGame.pick):
 * ОБНОВЛЁННОЕ домашнее правило — удар шашкой в своём доме ЗАПИРАЕТ эту шашку:
 * обычным ходом дальше она не идёт, оставшийся кубик играется другой шашкой. */
import { describe, it, expect, beforeAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGame, type GameSnapshot } from './useGame';
import type { GameState } from '../engine/types';

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

function craft(): GameState {
  const pts = new Array(24).fill(0);
  pts[5] = 1;    // белая, которой бьём (в доме белых)
  pts[13] = 14;  // остальные белые (вне дома — выноса нет)
  pts[2] = -1;   // ЧЁРНЫЙ БЛОТ в доме белых → удар «в своей зоне»
  pts[18] = -14; // остальные чёрные
  return { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn: 'w', dice: [3, 2], rolled: [3, 2], variant: 'short' } as GameState;
}

describe('UI-путь: удар в своём доме ЗАПИРАЕТ побившую шашку', () => {
  it('после 5->2 (бой) шашка на 2 не ходит обычным ходом; играет другая (13->11)', () => {
    const initial: GameSnapshot = {
      game: craft(), phase: 'humanMove', message: 'Выберите шашку и ход', winner: null, rollId: 1,
    };
    const { result } = renderHook(() => useGame('w', 'medium', 'short', undefined, initial));

    expect(result.current.phase).toBe('humanMove');
    act(() => result.current.pick(5));
    act(() => result.current.pick(2)); // удар 5->2 (кубик 3)

    expect(result.current.game.pts[2]).toBe(1);
    expect(result.current.game.bar.b).toBe(1);
    expect(result.current.game.dice).toEqual([2]);
    expect(result.current.phase).toBe('humanMove');
    // Новое правило: побившая шашка на 2 заперта (не все дома → выноса нет).
    expect(result.current.sources.has(2)).toBe(false);
    expect(result.current.sources.has(13)).toBe(true);

    act(() => result.current.pick(13));
    act(() => result.current.pick(11));
    expect(result.current.game.pts[2]).toBe(1);
    expect(result.current.game.pts[11]).toBe(1);
    expect(result.current.game.dice.length).toBe(0);
  });
});
