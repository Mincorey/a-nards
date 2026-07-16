import { describe, it, expect } from 'vitest';
import * as E from '../engine/core';
import { allowedMoves } from './rules';
import type { GameState, Variant } from '../engine/types';

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

// Полная партия через СЛОЙ ПРАВИЛ (allowedMoves — тот же, что использует UI/хук).
// Оба игрока играют жадно случайный ход из allowedMoves. Проверяем, что партия
// всегда завершается (isGameOver) за разумное число ходов и победитель имеет 15.
function playFull(variant: Variant, rng: () => number): { over: boolean; turns: number } {
  const s: GameState = E.initState(variant);
  let turns = 0;
  while (!E.isGameOver(s) && turns < 4000) {
    E.startTurn(s, rng);
    let guard = 0;
    while (s.dice.length > 0 && guard++ < 12) {
      const moves = allowedMoves(s);
      if (moves.length === 0) break;
      const m = moves[Math.floor(rng() * moves.length)];
      E.applyMove(s, m.from, m.to, m.die);
      if (E.isGameOver(s)) break;
    }
    E.endTurn(s);
    turns++;
  }
  return { over: E.isGameOver(s), turns };
}

describe('Полные партии через слой правил всегда завершаются', () => {
  for (const variant of ['short', 'long'] as Variant[]) {
    it(`${variant}: 60 партий доходят до победы (вынос 15)`, () => {
      const rng = makeRng(variant === 'short' ? 777 : 999);
      let stuck = 0;
      for (let i = 0; i < 60; i++) {
        const { over } = playFull(variant, rng);
        if (!over) stuck++;
      }
      expect(stuck, `${variant}: застрявших партий (не завершились)`).toBe(0);
    });
  }
});
