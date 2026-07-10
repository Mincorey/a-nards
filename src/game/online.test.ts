/* =============================================================================
 * online.test.ts — Проверка серверного авторитетного цикла партии.
 * Воспроизводит логику Edge Functions roll-dice + play-move на канонических
 * движке и правилах (тот же код, что задеплоен в _shared): детерминированный
 * бросок по seed + ход из allowedMoves + авто-пас/смена игрока. Гарантирует,
 * что серверный алгоритм доводит партию до победителя без нарушения целостности.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import * as E from '../engine/shortNardy';
import { allowedMoves } from './rules';

/** mulberry32 — копия серверного ГСЧ (supabase/functions/_shared/util.ts). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Авторитетный прогон одной партии (как сервер), возвращает победителя. */
function playServerGame(seed: number): 'w' | 'b' {
  const s = E.initState();
  let ply = 0;
  let guard = 0;
  while (!E.isGameOver(s) && guard++ < 5000) {
    // roll-dice: детерминированный бросок по seed+ply
    const rng = mulberry32((seed ^ (ply * 2654435761)) >>> 0);
    E.startTurn(s, rng);
    // play-move: пока есть разрешённые ходы — играем первый (как клиент бы прислал)
    let moves = allowedMoves(s);
    while (moves.length > 0) {
      const m = moves[0];
      E.applyMove(s, m.from, m.to, m.die);
      if (E.isGameOver(s)) break;
      moves = allowedMoves(s);
    }
    // целостность после каждого хода: ровно по 15 шашек у каждого цвета
    expect(E.checkerCount(s, 'w')).toBe(15);
    expect(E.checkerCount(s, 'b')).toBe(15);
    if (E.isGameOver(s)) break;
    E.endTurn(s);
    ply += 1;
  }
  const w = E.winner(s);
  expect(w).not.toBeNull();
  return w as 'w' | 'b';
}

describe('серверный авторитетный цикл партии', () => {
  it('детерминирован по seed (одинаковый seed → одинаковый победитель)', () => {
    expect(playServerGame(12345)).toBe(playServerGame(12345));
    expect(playServerGame(2026)).toBe(playServerGame(2026));
  });

  it('20 партий с разными seed завершаются победителем, целостность сохранена', () => {
    for (let i = 0; i < 20; i++) {
      const w = playServerGame(1000 + i * 7);
      expect(w === 'w' || w === 'b').toBe(true);
    }
  });
});
