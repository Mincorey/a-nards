// @vitest-environment jsdom
/* Звук постановки шашки: playChecker вызывается при приземлении фишки (конец
 * перелёта) при любом ходе, и сразу — при выносе схлопнутой цепочкой. */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createElement } from 'react';

const checkerSpy = vi.fn();
vi.mock('../../lib/sound', () => ({ playChecker: () => checkerSpy(), playDiceRoll: () => {}, playVictory: () => {} }));

import Board from './Board';
import type { GameState } from '../../engine/types';

beforeAll(() => {
  globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} } as never;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0)) as never;
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id as unknown as number)) as never;
});
afterEach(() => { cleanup(); checkerSpy.mockClear(); });
const wait = (ms:number)=>act(async()=>{await new Promise(r=>setTimeout(r,ms));});
function S(pts:Record<number,number>, off:{w:number,b:number}):GameState {
  const a=new Array(24).fill(0); for(const k in pts) a[+k]=pts[+k];
  return { pts:a, bar:{w:0,b:0}, off, turn:'w', dice:[], rolled:[4,2], variant:'short' } as GameState;
}

describe('Звук постановки шашки', () => {
  it('обычный ход: звук звучит один раз при приземлении', async () => {
    const s0=S({7:1, 0:5}, {w:0,b:0});
    const s1=S({3:1, 0:5}, {w:0,b:0}); // 7->3
    const { rerender } = render(createElement(Board,{state:s0,myColor:'w'}));
    rerender(createElement(Board,{state:s1,myColor:'w'}));
    await wait(30);
    expect(checkerSpy).not.toHaveBeenCalled();   // ещё летит — не приземлилась
    await wait(1000);                            // перелёт завершился
    expect(checkerSpy).toHaveBeenCalledTimes(1);
  });

  it('вынос схлопнутой цепочкой из аутфилда: звук сразу (без перелёта)', async () => {
    const s0=S({7:1, 0:5}, {w:9,b:0});
    const s2=S({0:5}, {w:10,b:0}); // 7->..->off одним render
    const { rerender } = render(createElement(Board,{state:s0,myColor:'w'}));
    rerender(createElement(Board,{state:s2,myColor:'w'}));
    expect(checkerSpy).toHaveBeenCalledTimes(1);
  });
});
