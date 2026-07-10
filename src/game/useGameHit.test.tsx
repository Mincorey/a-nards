// @vitest-environment jsdom
/* Интеграционный тест реального игрового пути UI (useGame.pick):
 * удар шашкой в своей зоне → продолжение хода ТОЙ ЖЕ шашкой должно быть возможно. */
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
  pts[13] = 14;  // остальные белые (вне дома — без выноса)
  pts[2] = -1;   // ЧЁРНЫЙ БЛОТ в доме белых → удар «в своей зоне»
  pts[18] = -14; // остальные чёрные
  return { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn: 'w', dice: [3, 2], rolled: [3, 2], variant: 'short' } as GameState;
}

describe('UI-путь: удар в своей зоне + продолжение той же шашкой', () => {
  it('после 5->2 (бой) шашка на 2 доступна и ходит 2->0', () => {
    const initial: GameSnapshot = {
      game: craft(), phase: 'humanMove', message: 'Выберите шашку и ход', winner: null, rollId: 1,
    };
    const { result } = renderHook(() => useGame('w', 'medium', 'short', undefined, initial));

    expect(result.current.phase).toBe('humanMove');
    // 1) выбираем шашку 5 и бьём на 2
    act(() => result.current.pick(5));
    expect(result.current.selected).toBe(5);
    act(() => result.current.pick(2));

    // после удара: чёрный на баре, белая на 2, остался кубик 2
    expect(result.current.game.pts[2]).toBe(1);
    expect(result.current.game.bar.b).toBe(1);
    expect(result.current.game.dice).toEqual([2]);
    expect(result.current.phase).toBe('humanMove');
    // Ключевое: шашка на 2 (которой били) снова доступна как источник
    expect(result.current.sources.has(2)).toBe(true);

    // 2) продолжаем ТОЙ ЖЕ шашкой: 2 -> 0
    act(() => result.current.pick(2));
    expect(result.current.selected).toBe(2);
    act(() => result.current.pick(0));

    expect(result.current.game.pts[2]).toBe(0);
    expect(result.current.game.pts[0]).toBe(1);
    expect(result.current.game.dice.length).toBe(0);
  });
});
