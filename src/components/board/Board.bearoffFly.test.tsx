// @vitest-environment jsdom
/* Регрессия: полёт при выносе ПОЛНОСТЬЮ отключён.
 *  По требованию пользователя при выносе на другой половине доски не должно
 *  происходить никаких движений. Поэтому НИ обычный вынос из дома, НИ вынос
 *  «схлопнутой цепочкой» из аутфилда НЕ рисуют летящую фишку (.bd-fly) — снятая
 *  шашка просто появляется в лотке. Это гарантированно исключает «фантомную
 *  фишку с противоположной стороны доски». */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createElement } from 'react';
import Board from './Board';
import type { GameState } from '../../engine/types';

beforeAll(() => { globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} } as never; });
afterEach(cleanup);
const wait = (ms:number)=>act(async()=>{await new Promise(r=>setTimeout(r,ms));});
const flies = (c:HTMLElement)=>Array.from(c.querySelectorAll('.bd-fly')) as HTMLElement[];
function S(pts:Record<number,number>, off:{w:number,b:number}):GameState {
  const a=new Array(24).fill(0); for(const k in pts) a[+k]=pts[+k];
  return { pts:a, bar:{w:0,b:0}, off, turn:'w', dice:[], rolled:[5,3], variant:'short' } as GameState;
}

describe('Полёт при выносе', () => {
  it('обычный вынос из ДОМА (пункт 4, справа) — БЕЗ перелёта (ничего не летит через доску)', async () => {
    const s0=S({4:1, 0:4}, {w:10,b:0});
    const s1=S({0:4}, {w:11,b:0}); // вынос 4->off
    const { container, rerender } = render(createElement(Board,{state:s0,myColor:'w'}));
    rerender(createElement(Board,{state:s1,myColor:'w'}));
    expect(flies(container).length).toBe(0);     // перелёт при выносе отключён
    await wait(50);
    expect(flies(container).length).toBe(0);
  });

  it('вынос схлопнутой цепочкой из АУТФИЛДА (пункт 7, слева) — БЕЗ перелёта (нет фантома слева)', async () => {
    const s0=S({7:1, 0:4}, {w:10,b:0});
    const s2=S({0:4}, {w:11,b:0}); // 7->…->off за один render
    const { container, rerender } = render(createElement(Board,{state:s0,myColor:'w'}));
    rerender(createElement(Board,{state:s2,myColor:'w'}));
    expect(flies(container).length).toBe(0);     // фантомный перелёт слева подавлен
    await wait(50);
    expect(flies(container).length).toBe(0);
  });
});
