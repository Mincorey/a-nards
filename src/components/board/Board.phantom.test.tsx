// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createElement } from 'react';
import Board from './Board';
import type { GameState } from '../../engine/types';

beforeAll(() => {
  globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} } as never;
  // Быстрый rAF → детерминированный старт перехода полёта (иначе jsdom флакает).
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0)) as never;
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id as unknown as number)) as never;
});
afterEach(cleanup);

function base(): GameState {
  const pts = new Array(24).fill(0);
  pts[7] = 1; pts[13] = 14; pts[3] = -1; pts[18] = -14;
  return { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn: 'w', dice: [4, 2], rolled: [4, 2], variant: 'short' } as GameState;
}
function afterHit(): GameState {
  const s = base(); s.pts = [...s.pts];
  s.pts[7] = 0; s.pts[3] = 1; s.bar = { w: 0, b: 1 }; s.dice = [2];
  return s;
}
const fly = (c: HTMLElement) => c.querySelectorAll('.bd-fly').length;
const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

describe('Фантомная анимация боя', () => {
  it('чистый бой анимируется (2 оверлея), затем завершается', async () => {
    const { container, rerender } = render(createElement(Board, { state: base(), myColor: 'w' }));
    rerender(createElement(Board, { state: afterHit(), myColor: 'w' }));
    await wait(20);
    expect(fly(container)).toBe(2);        // жертва→бар + атакующая→пункт
    await wait(1300);
    expect(fly(container)).toBe(0);        // анимация завершилась
  });

  it('осцилляция (дубль/реордер) НЕ порождает второй полёт того же хода', async () => {
    const { container, rerender } = render(createElement(Board, { state: base(), myColor: 'w' }));
    rerender(createElement(Board, { state: afterHit(), myColor: 'w' }));
    await wait(20);
    expect(fly(container)).toBe(2);
    await wait(1300);                       // первый полёт завершился
    expect(fly(container)).toBe(0);
    // Просочилось устаревшее before → возврат к недавней позиции
    rerender(createElement(Board, { state: base(), myColor: 'w' }));
    await wait(20);
    expect(fly(container)).toBe(0);        // ФАНТОМ ПОДАВЛЁН: реверс не анимируется
    // Снова after → тоже недавняя позиция
    rerender(createElement(Board, { state: afterHit(), myColor: 'w' }));
    await wait(20);
    expect(fly(container)).toBe(0);        // ФАНТОМ ПОДАВЛЁН: повтор не анимируется
  });

  it('два РАЗНЫХ последовательных хода анимируются оба (не ложное подавление)', async () => {
    const { container, rerender } = render(createElement(Board, { state: base(), myColor: 'w' }));
    const s1 = base(); s1.pts = [...s1.pts]; s1.pts[7] = 0; s1.pts[11] = 1; // 7->11 (die4)
    rerender(createElement(Board, { state: s1, myColor: 'w' }));
    await wait(20);
    expect(fly(container)).toBe(1);
    await wait(400);
    const s2 = base(); s2.pts = [...s1.pts]; s2.pts[13] = 13; s2.pts[11] = 2; // 13->11 (другой ход, новая позиция)
    rerender(createElement(Board, { state: s2, myColor: 'w' }));
    await wait(20);
    expect(fly(container)).toBe(1);        // второй РАЗНЫЙ ход тоже анимируется
  });
});
