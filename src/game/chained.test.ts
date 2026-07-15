import { describe, it, expect } from 'vitest';
import { chainedTargetsFrom, targetsFrom } from './rules';
import type { GameState } from '../engine/types';

function st(pts: Record<number, number>, dice: number[], rolled: [number, number], turn: 'w'|'b'='w'): GameState {
  const arr = new Array(24).fill(0);
  for (const k of Object.keys(pts)) arr[+k] = pts[+k];
  return { pts: arr, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn, dice, rolled, variant: 'short' } as GameState;
}

describe('chainedTargetsFrom — конечные точки цепочки', () => {
  it('разные кубики [3,2]: белая с p12 может дойти до p7 цепочкой', () => {
    // p12 -> p9 (die3) -> p7 (die2)  ИЛИ p12 -> p10 (die2) -> p7 (die3). Конечная p7.
    const s = st({ 12: 1, 0: 14, 23: -15 }, [3, 2], [3, 2]);
    const singles = targetsFrom(s, 12).map((m) => m.to).sort();
    const chains = chainedTargetsFrom(s, 12);
    const chainTos = chains.map((c) => c.to).sort();
    expect(singles).toContain(9);  // промежуточная (die3)
    expect(singles).toContain(10); // промежуточная (die2)
    expect(chainTos).toContain(7); // КОНЕЧНАЯ (оба кубика)
    const c7 = chains.find((c) => c.to === 7)!;
    expect(c7.seq.length).toBe(2); // ровно два полухода одной шашкой
    // применение цепочки последовательно легально: сумма 5
    expect(c7.seq.reduce((a, m) => a + m.die, 0)).toBe(5);
  });

  it('дубли [2,2]: белая с p8 доходит до p6,p4,p2 (2..4 кубика)', () => {
    const s = st({ 8: 1, 0: 14, 23: -15 }, [2, 2, 2, 2], [2, 2]);
    const chainTos = chainedTargetsFrom(s, 8).map((c) => c.to).sort((a, b) => (a as number) - (b as number));
    expect(chainTos).toEqual([0, 2, 4]); // p4(2куб), p2(3куб), p0(4куб); p8->p6 (1 куб) — одиночная
    expect(targetsFrom(s, 8).map((m) => m.to)).toContain(6);
  });

  it('если второй кубик перекрыт соперником — цепочки нет', () => {
    // p12 -> p9 (die3). Далее die2 -> p7 заблокирован (2+ чёрных). Одиночная p9 есть, цепочки нет.
    const s = st({ 12: 1, 7: -2, 0: 13, 23: -13 }, [3, 2], [3, 2]);
    const singles = targetsFrom(s, 12).map((m) => m.to);
    const chains = chainedTargetsFrom(s, 12).map((c) => c.to);
    // p10 (die2) then die3 -> p7 blocked; p9 (die3) then die2 -> p7 blocked. Нет конечной p7.
    expect(chains).not.toContain(7);
    expect(singles.length).toBeGreaterThan(0);
  });
});
