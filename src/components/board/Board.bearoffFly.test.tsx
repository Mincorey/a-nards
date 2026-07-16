// @vitest-environment jsdom
/* Регрессия: полёт при выносе.
 *  • Обычный вынос ИЗ ДОМА — фишка летит из своего пункта (правая половина у
 *    белых) к центральному лотку (перелёт сохраняется).
 *  • Вынос «схлопнутой цепочкой» из аутфилда (например 7→…→off одной шашкой за
 *    один render) НЕ анимируется как прямой перелёт из аутфилда к центру —
 *    иначе появляется «фантомная фишка с противоположной стороны доски». */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createElement } from 'react';
import Board from './Board';
import type { GameState } from '../../engine/types';

beforeAll(() => { globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} } as never; });
afterEach(cleanup);
const wait = (ms:number)=>act(async()=>{await new Promise(r=>setTimeout(r,ms));});
const flies = (c:HTMLElement)=>Array.from(c.querySelectorAll('.bd-fly')) as HTMLElement[];
const fromX = (el:HTMLElement)=>parseFloat((el.style.transform.match(/translate\(([-\d.]+)px/)||[])[1]||'NaN');
function S(pts:Record<number,number>, off:{w:number,b:number}):GameState {
  const a=new Array(24).fill(0); for(const k in pts) a[+k]=pts[+k];
  return { pts:a, bar:{w:0,b:0}, off, turn:'w', dice:[], rolled:[5,3], variant:'short' } as GameState;
}
const DIVCX = 997;

describe('Полёт при выносе', () => {
  it('обычный вынос из ДОМА (пункт 4, справа) — перелёт есть и стартует СПРАВА', async () => {
    const s0=S({4:1, 0:4}, {w:10,b:0});
    const s1=S({0:4}, {w:11,b:0}); // вынос 4->off
    const { container, rerender } = render(createElement(Board,{state:s0,myColor:'w'}));
    rerender(createElement(Board,{state:s1,myColor:'w'}));
    const f = flies(container);
    expect(f.length).toBe(1);                    // перелёт сохранён
    expect(fromX(f[0])).toBeGreaterThan(DIVCX);  // старт в ПРАВОЙ (домашней) половине
    await wait(400);
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
