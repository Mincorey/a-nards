/* =============================================================================
 * bot.ts — Бот для коротких нард. Перебирает все максимальные последовательности
 * ходов за текущий бросок и выбирает лучшую по оценочной функции.
 * ========================================================================== */
import type { Color, GameState, Move } from '../engine/types';
import * as E from '../engine/core';
import { maximalSequences } from './rules';

export type Difficulty = 'easy' | 'medium' | 'hard';

const sign = (c: Color) => (c === 'w' ? 1 : -1);

/** Оценка позиции глазами игрока `me` (больше — лучше для me). */
export function evaluate(s: GameState, me: Color, diff: Difficulty): number {
  const opp = E.opp(me);
  const sg = sign(me);

  // 1) Разница pip-счёта (у меня меньше — хорошо). pipCount учитывает вариант.
  let score = E.pipCount(s, opp) - E.pipCount(s, me);

  // 2) Вынесенные шашки — сильный плюс.
  const myOff = me === 'w' ? s.off.w : s.off.b;
  score += myOff * 8;

  if (s.variant === 'long') {
    // Длинные нарды: боя нет — «блотов» нет. Поощряем занятые пункты в доме
    // (готовность к выносу) и «строителей» (пункты 2+), штрафуем застой на голове.
    const HEAD_I = me === 'w' ? 23 : 11;
    let homePoints = 0;
    let builders = 0;
    for (let i = 0; i < 24; i++) {
      const v = s.pts[i] * sg;
      if (v <= 0) continue;
      const isHome = me === 'w' ? (i >= 0 && i <= 5) : (i >= 12 && i <= 17);
      if (isHome) homePoints += 1;
      if (v >= 2) builders += 1;
    }
    const onHead = s.pts[HEAD_I] * sg; // сколько шашек ещё на голове
    const homeW = diff === 'hard' ? 4 : diff === 'medium' ? 3 : 0;
    const buildW = diff === 'easy' ? 0 : 1;
    score += homePoints * homeW + builders * buildW - onHead * 0.5;
    return score;
  }

  // Короткие нарды / нарды с боем.
  // 3) Шашки на баре — минус (сверх pip).
  const myBar = me === 'w' ? s.bar.w : s.bar.b;
  score -= myBar * 6;

  const blotW = diff === 'hard' ? 7 : diff === 'medium' ? 4 : 0;
  const pointBonus = diff === 'easy' ? 0 : 2;

  for (let i = 0; i < 24; i++) {
    const v = s.pts[i] * sg;
    if (v === 1) {
      // Блот: тем опаснее, чем ближе к шашкам соперника (могут добить).
      score -= blotW;
    } else if (v >= 2) {
      // Занятый пункт — небольшой бонус (строим «дом»/блокаду).
      score += pointBonus;
    }
  }
  return score;
}

/** Выбрать последовательность ходов за текущий бросок. */
export function chooseSequence(s: GameState, diff: Difficulty): Move[] {
  const seqs = maximalSequences(s);
  if (seqs.length === 0) return [];
  if (diff === 'easy') return seqs[Math.floor(Math.random() * seqs.length)];

  let best: Move[] = seqs[0];
  let bestScore = -Infinity;
  for (const seq of seqs) {
    const ns = E.cloneState(s);
    for (const m of seq) E.applyMove(ns, m.from, m.to, m.die);
    const sc = evaluate(ns, s.turn, diff);
    if (sc > bestScore) { bestScore = sc; best = seq; }
  }
  return best;
}
