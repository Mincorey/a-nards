/* =============================================================================
 * hitContinue.test.ts — Проверка задачи 6: после удара шашкой в своей зоне
 * игрок должен иметь право продолжить ход ЭТОЙ ЖЕ шашкой, если такое
 * продолжение легально и входит в максимальную последовательность.
 *
 * Тест перебирает множество случайных позиций коротких нард. Для каждой:
 *  1) находит максимальные последовательности ходов;
 *  2) выбирает те, где ПЕРВЫЙ ход — это УДАР (бьёт блот соперника) в своём доме;
 *  3) применяет удар и убеждается, что следующий ход ТОЙ ЖЕ шашкой (from == to
 *     удара) действительно предлагается в allowedMoves/targetsFrom, если он
 *     присутствует в какой-либо максимальной последовательности.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import * as S from '../engine/shortNardy';
import { maximalSequences, allowedMoves, targetsFrom } from './rules';
import type { GameState, Color } from '../engine/types';

const sign = (c: Color) => (c === 'w' ? 1 : -1);
const inHome = (c: Color, idx: number) => (c === 'w' ? idx >= 0 && idx <= 5 : idx >= 18 && idx <= 23);

// Детерминированный ГСЧ (LCG) — воспроизводимость.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// Случайная валидная-ish позиция: раскидываем 15 белых и 15 чёрных по пунктам,
// оставляя блоты, чтобы удары были возможны. Бар/офф — нули для простоты.
function randomState(rng: () => number): GameState {
  const pts = new Array<number>(24).fill(0);
  const place = (color: Color) => {
    let left = 15;
    const sg = sign(color);
    let guard = 0;
    while (left > 0 && guard++ < 200) {
      const idx = Math.floor(rng() * 24);
      // не ставим поверх чужой стопки (>=2), чтобы позиция была легальной
      if (pts[idx] * sg < -1) continue;
      // если там чужой блот — оставим его (возможность удара), не кладём своих туда
      if (pts[idx] * sg === -1) continue;
      const add = 1 + Math.floor(rng() * Math.min(3, left));
      pts[idx] += sg * add;
      left -= add;
    }
    // если не всех разместили — досыпаем на первый попавшийся свой/пустой
    for (let i = 0; i < 24 && left > 0; i++) {
      if (pts[i] * sg >= 0) { pts[i] += sg; left--; }
    }
  };
  place('w');
  place('b');
  return { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn: 'w', dice: [], rolled: null, variant: 'short' } as GameState;
}

describe('Задача 6: продолжение хода побившей шашкой', () => {
  it('удар в своей зоне не блокирует дальнейший ход той же шашкой', () => {
    const rng = makeRng(12345);
    let scenariosChecked = 0;

    for (let iter = 0; iter < 4000; iter++) {
      const base = randomState(rng);
      // корректность позиции
      if (S.checkerCount(base, 'w') !== 15 || S.checkerCount(base, 'b') !== 15) continue;

      const a = 1 + Math.floor(rng() * 6);
      const b = 1 + Math.floor(rng() * 6);
      base.rolled = [a, b];
      base.dice = S.diceToMoves([a, b]);

      const seqs = maximalSequences(base);
      if (seqs.length === 0) continue;

      // Ищем максимальные последовательности длиной >=2, где первый ход — удар
      // блота соперника в доме белых.
      for (const seq of seqs) {
        if (seq.length < 2) continue;
        const first = seq[0];
        if (first.to === 'off' || first.from === 'bar') continue;
        const toIdx = first.to as number;
        const isHit = base.pts[toIdx] * sign('w') === -1; // там чёрный блот
        if (!isHit) continue;
        if (!inHome('w', toIdx)) continue; // именно «в своей зоне»

        // Применяем удар.
        const s2 = S.cloneState(base);
        S.applyMove(s2, first.from, first.to, first.die);

        // Второй ход последовательности — той же шашкой?
        const second = seq[1];
        if (second.from !== toIdx) continue; // интересует продолжение ИМЕННО побившей шашкой

        scenariosChecked++;

        // Ключевая проверка: движок ДОЛЖЕН предлагать ход из toIdx.
        const offered = allowedMoves(s2).some((m) => m.from === toIdx);
        const tgts = targetsFrom(s2, toIdx);
        expect(offered, `после удара на ${toIdx} должен быть доступен ход этой же шашкой`).toBe(true);
        expect(tgts.length, `targetsFrom(${toIdx}) не должен быть пустым`).toBeGreaterThan(0);
      }
    }

    // Убеждаемся, что сценарии реально встретились (тест не «пустой»).
    expect(scenariosChecked).toBeGreaterThan(0);
    // Для наблюдаемости:
    console.log('Проверено сценариев «удар+продолжение той же шашкой»:', scenariosChecked);
  });
});
