import { describe, it, expect } from 'vitest';
import * as L from './longNardy.ts';
import { allowedMoves } from '../game/rules';
import type { GameState } from './types.ts';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('длинные нарды — расстановка и дистанция', () => {
  it('старт: 15 на голове у каждого', () => {
    const s = L.initState();
    expect(s.pts[23]).toBe(15);
    expect(s.pts[11]).toBe(-15);
    expect(L.checkerCount(s, 'w')).toBe(15);
    expect(L.checkerCount(s, 'b')).toBe(15);
    expect(s.variant).toBe('long');
  });

  it('дистанция до выноса считается верно', () => {
    expect(L.toDist('w', 0)).toBe(1);
    expect(L.toDist('w', 23)).toBe(24);
    expect(L.toDist('b', 12)).toBe(1);
    expect(L.toDist('b', 11)).toBe(24);
    expect(L.toDist('b', 0)).toBe(13);
  });
});

describe('длинные нарды — правила', () => {
  it('с головы за ход уходит только одна шашка', () => {
    const s = L.initState();
    s.rolled = [3, 5]; s.dice = [3, 5]; s.headUsed = 0;
    const first = L.allLegalMoves(s);
    expect(first.every((m) => m.from === 23)).toBe(true); // только голова в игре
    L.applyMove(s, 23, L.destFor('w', 23, 3) as number, 3);
    expect(s.headUsed).toBe(1);
    const after = L.allLegalMoves(s);
    expect(after.some((m) => m.from === 23)).toBe(false); // вторую с головы нельзя
  });

  it('боя нет: пункт с шашкой соперника закрыт', () => {
    const s = L.initState();
    const dest = L.destFor('w', 23, 3) as number;
    s.pts[dest] = -1; // ставим чёрную на цель
    s.rolled = [3, 3]; s.dice = [3, 3, 3, 3]; s.headUsed = 0;
    const moves = L.legalMovesFrom(s, 23);
    expect(moves.length).toBe(0); // ход на занятый соперником пункт запрещён
  });
});

describe('длинные нарды — целостность и завершение', () => {
  function play(seed: number): 'w' | 'b' {
    const s: GameState = L.initState();
    const rng = mulberry32(seed);
    let guard = 0;
    while (!L.isGameOver(s) && guard++ < 6000) {
      L.startTurn(s, rng);
      let moves = allowedMoves(s);
      while (moves.length > 0) {
        const m = moves[0];
        L.applyMove(s, m.from, m.to, m.die);
        if (L.isGameOver(s)) break;
        moves = allowedMoves(s);
      }
      expect(L.checkerCount(s, 'w')).toBe(15);
      expect(L.checkerCount(s, 'b')).toBe(15);
      if (L.isGameOver(s)) break;
      L.endTurn(s);
    }
    const w = L.winner(s);
    expect(w).not.toBeNull();
    return w as 'w' | 'b';
  }

  it('15 партий завершаются победителем, целостность сохранена', () => {
    for (let i = 0; i < 15; i++) {
      const w = play(7000 + i * 13);
      expect(w === 'w' || w === 'b').toBe(true);
    }
  });
});

describe('длинные нарды — правило головы (аудит M5)', () => {
  function headMovesFor(roll: [number, number]): number {
    const s = L.initState();
    s.turn = 'w'; s.rolled = roll; s.dice = L.diceToMoves(roll); s.headUsed = 0;
    let heads = 0; let guard = 0;
    for (;;) {
      if (guard++ > 10) break;
      const mv = L.allLegalMoves(s).find((m) => m.from === 23);
      if (!mv) break;
      L.applyMove(s, mv.from, mv.to, mv.die);
      heads++;
    }
    return heads;
  }

  it('первый ход дублями 6-6/4-4/3-3 — 2 шашки с головы', () => {
    expect(headMovesFor([6, 6])).toBe(2);
    expect(headMovesFor([4, 4])).toBe(2);
    expect(headMovesFor([3, 3])).toBe(2);
  });

  it('первый ход прочими дублями/бросками — только 1 с головы', () => {
    expect(headMovesFor([5, 5])).toBe(1);
    expect(headMovesFor([2, 2])).toBe(1);
    expect(headMovesFor([6, 3])).toBe(1);
  });

  it('не первый ход (голова не полная) дублями 6-6 — только 1 с головы', () => {
    const pts = new Array<number>(24).fill(0);
    pts[23] = 14; pts[17] = 1; pts[11] = -15;
    const s: GameState = { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn: 'w', dice: [6, 6, 6, 6], rolled: [6, 6], variant: 'long', headUsed: 0 };
    let heads = 0; let guard = 0;
    for (;;) { if (guard++ > 10) break; const mv = L.allLegalMoves(s).find((m) => m.from === 23); if (!mv) break; L.applyMove(s, mv.from, mv.to, mv.die); heads++; }
    expect(heads).toBe(1);
  });
});

describe('длинные нарды — запрет запирания всех шашек соперника (аудит M5)', () => {
  // Стена белых idx0,1,2,4,5 (разрыв в idx3); мовер на idx9 (die6 → idx3 замыкает idx0..5).
  function trapState(blackAhead: boolean): GameState {
    const pts = new Array<number>(24).fill(0);
    pts[0] = 6; pts[1] = 2; pts[2] = 2; pts[4] = 2; pts[5] = 2; pts[9] = 1;
    if (blackAhead) { pts[7] = -4; pts[8] = -4; pts[10] = -4; pts[11] = -2; pts[23] = -1; }
    else { pts[7] = -4; pts[8] = -4; pts[10] = -4; pts[11] = -3; }
    return { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn: 'w', dice: [6], rolled: [6, 3], variant: 'long', headUsed: 1 };
  }

  it('ход, замыкающий 6-прайм и запирающий все 15 шашек, — запрещён', () => {
    const moves = L.legalMovesFrom(trapState(false), 9).filter((m) => m.to === 3);
    expect(moves.length).toBe(0);
  });

  it('тот же ход разрешён, если у соперника есть прошедшая шашка', () => {
    const moves = L.legalMovesFrom(trapState(true), 9).filter((m) => m.to === 3);
    expect(moves.length).toBe(1);
  });
});
