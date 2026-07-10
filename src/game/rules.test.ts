import { describe, it, expect } from 'vitest';
import * as E from '../engine/shortNardy';
import * as Core from '../engine/core';
import { allowedMoves, maximalSequences, getLastExpansions } from './rules';
import type { GameState } from '../engine/types';

const empty = (): GameState => ({
  pts: new Array(24).fill(0), bar: { w: 0, b: 0 }, off: { w: 0, b: 0 },
  turn: 'w', dice: [], rolled: null,
});

describe('rules — максимальное использование кубиков', () => {
  it('обязан использовать оба кубика, если возможно', () => {
    const s = E.initState();
    s.turn = 'w';
    s.rolled = [6, 1];
    s.dice = [6, 1];
    const seqs = maximalSequences(s);
    expect(seqs.length).toBeGreaterThan(0);
    expect(seqs.every((seq) => seq.length === 2)).toBe(true);
  });

  it('если играется только один кубик — обязателен больший', () => {
    // Конструируем позицию: белые с баром, дом соперника (пункты 18..23)
    // почти закрыт, открыт только вход под больший кубик.
    const s = empty();
    s.turn = 'w';
    s.bar.w = 1;
    // Вход белых с бара кубиком d → пункт 24-d (индекс). d=6→18, d=1→23.
    // Закроем 23 (вход для 1), оставим 18 (вход для 6) открытым.
    s.pts[23] = -2; // закрыт для входа кубиком 1
    s.pts[18] = 0;  // открыт для входа кубиком 6
    s.rolled = [6, 1];
    s.dice = [6, 1];
    const moves = allowedMoves(s);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.die === 6)).toBe(true);
  });

  it('нет ходов → пустой список', () => {
    const s = empty();
    s.turn = 'w';
    s.bar.w = 1;
    // полностью закрыт дом соперника 18..23
    for (let i = 18; i <= 23; i++) s.pts[i] = -2;
    s.rolled = [3, 4];
    s.dice = [3, 4];
    expect(allowedMoves(s)).toEqual([]);
  });

  it('дубль: до 4 ходов, если возможно', () => {
    const s = E.initState();
    s.turn = 'w';
    s.rolled = [2, 2];
    s.dice = [2, 2, 2, 2];
    const seqs = maximalSequences(s);
    expect(Math.max(...seqs.map((x) => x.length))).toBe(4);
  });
});

// M6 — предохранитель перебора: мемоизация по транспозициям гарантирует, что
// число раскрытий остаётся малым и GUARD (200000) никогда не срабатывает,
// даже в тяжёлых позициях (дубли, длинные нарды с полной головой).
describe('rules — M6: перебор ограничен, GUARD не срабатывает', () => {
  const seeded = (seed: number) => {
    let x = seed & 0x7fffffff;
    return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  };

  it('на 30k случайных позиций (короткие+длинные) раскрытий < 2000', () => {
    let worst = 0;
    for (const variant of ['short', 'long'] as const) {
      for (let g = 0; g < 250; g++) {
        const rng = seeded(1 + g * 31 + (variant === 'long' ? 7 : 0));
        let s = Core.initState(variant);
        for (let t = 0; t < 60; t++) {
          if (Core.isGameOver(s)) s = Core.initState(variant);
          Core.startTurn(s, rng);
          maximalSequences(s);
          worst = Math.max(worst, getLastExpansions());
          Core.autoPlayTurn(s);
          Core.endTurn(s);
        }
      }
    }
    // Эмпирически worst ~ сотни; порог 2000 — с большим запасом до GUARD=200000.
    expect(worst).toBeLessThan(2000);
  });

  it('стартовая позиция длинных нард дублем 6-6 (полная голова) — раскрытий < 2000', () => {
    const s = Core.initState('long');
    s.turn = 'w';
    s.rolled = [6, 6];
    s.dice = [6, 6, 6, 6];
    const seqs = maximalSequences(s);
    expect(seqs.length).toBeGreaterThan(0);
    expect(getLastExpansions()).toBeLessThan(2000);
  });
});

// M6 (усиление): дифференциальная проверка — мемоизированный maximalSequences
// обязан давать РОВНО те же легальные первые ходы и ту же макс. длину, что и
// наивный полный перебор (старый подход). Гарантия, что оптимизация не изменила
// правила игры ни в одной позиции.
describe('rules — M6: эквивалентность мемоизации и полного перебора', () => {
  const key = (m: { from: number | 'bar'; to: number | 'off'; die: number }) =>
    `${m.from}>${m.to}:${m.die}`;

  // Наивный эталон: все максимальные последовательности (без мемоизации) +
  // то же правило «большего кубика», что и в rules.ts.
  function bruteAllowed(s: GameState): { firsts: string[]; maxLen: number } {
    let maxLen = 0;
    let results: { from: number | 'bar'; to: number | 'off'; die: number }[][] = [];
    function rec(st: GameState, acc: { from: number | 'bar'; to: number | 'off'; die: number }[]) {
      const seen = new Set<string>();
      const moves = Core.allLegalMoves(st).filter((m) => {
        const k = key(m); if (seen.has(k)) return false; seen.add(k); return true;
      });
      if (moves.length === 0) {
        if (acc.length > maxLen) { maxLen = acc.length; results = [acc]; }
        else if (acc.length === maxLen && acc.length > 0) results.push(acc);
        return;
      }
      for (const m of moves) {
        const ns = Core.cloneState(st);
        Core.applyMove(ns, m.from, m.to, m.die);
        rec(ns, [...acc, m]);
      }
    }
    rec(Core.cloneState(s), []);
    if (maxLen === 1 && s.rolled && s.rolled[0] !== s.rolled[1]) {
      const larger = Math.max(s.rolled[0], s.rolled[1]);
      const withLarger = results.filter((seq) => seq[0].die === larger);
      if (withLarger.length > 0) results = withLarger;
    }
    const firsts = [...new Set(results.map((seq) => key(seq[0])))].sort();
    return { firsts, maxLen: maxLen === 0 ? 0 : maxLen };
  }

  const seeded = (seed: number) => {
    let x = seed & 0x7fffffff;
    return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  };

  it('первые ходы и макс. длина совпадают на ~4800 позициях (short+long)', () => {
    let compared = 0;
    for (const variant of ['short', 'long'] as const) {
      for (let g = 0; g < 60; g++) {
        const rng = seeded(101 + g * 17 + (variant === 'long' ? 5 : 0));
        let s = Core.initState(variant);
        for (let t = 0; t < 40; t++) {
          if (Core.isGameOver(s)) s = Core.initState(variant);
          Core.startTurn(s, rng);

          const brute = bruteAllowed(s);
          const memoFirsts = [...new Set(allowedMoves(s).map(key))].sort();
          const memoMax = maximalSequences(s).reduce((mx, seq) => Math.max(mx, seq.length), 0);

          expect(memoFirsts).toEqual(brute.firsts);
          expect(memoMax).toBe(brute.maxLen);
          compared++;

          Core.autoPlayTurn(s);
          Core.endTurn(s);
        }
      }
    }
    expect(compared).toBeGreaterThan(4000);
  });
});
