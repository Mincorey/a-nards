/* =============================================================================
 * hitContinue.test.ts — Домашнее правило (обновлено): после УДАРА шашкой в
 * СВОЁМ ДОМЕ эта шашка больше НЕ может ходить обычным ходом до конца хода —
 * разрешён ТОЛЬКО вынос ('off'), если он вообще возможен.
 *
 * (Раньше правило было обратным — «Задача 6» разрешала продолжение той же
 * шашкой; по требованию игроков поведение изменено на противоположное.)
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import * as S from '../engine/shortNardy';
import { allowedMoves, targetsFrom } from './rules';
import type { GameState } from '../engine/types';

describe('Домашнее правило: удар в своём доме запирает побившую шашку', () => {
  it('после удара в доме обычный ход той же шашкой НЕДОСТУПЕН (не все дома → и выноса нет)', () => {
    // Белая на 5 бьёт чёрный блот на 2 (оба в доме белых 0..5). Есть белые вне
    // дома (13) → вынос невозможен. Значит после удара шашка на 2 ЗАПЕРТА.
    const pts = new Array(24).fill(0);
    pts[5] = 1; pts[13] = 14; pts[2] = -1; pts[18] = -14;
    const s: GameState = { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn: 'w', dice: [3, 2], rolled: [3, 2], variant: 'short' };

    S.applyMove(s, 5, 2, 3); // удар кубиком 3
    expect(s.pts[2]).toBe(1);
    expect(s.bar.b).toBe(1);
    expect(s.hitLock).toContain(2);

    const from2 = targetsFrom(s, 2);
    expect(from2.length, 'из побившей шашки (2) не должно быть ходов').toBe(0);
    expect(allowedMoves(s).some((m) => m.from === 13)).toBe(true);
  });

  it('после удара в доме РАЗРЕШЁН только вынос той же шашкой (когда все дома)', () => {
    // Все белые в доме. Белая на 3 бьёт блот на 0. Оставшимся кубиком 1 —
    // единственный ход побившей шашки: ВЫНОС 0->off (обычных ходов нет).
    const pts = new Array(24).fill(0);
    pts[3] = 1; pts[1] = 13; pts[0] = -1; pts[18] = -14;
    const s: GameState = { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn: 'w', dice: [3, 1], rolled: [3, 1], variant: 'short' };

    S.applyMove(s, 3, 0, 3);
    expect(s.pts[0]).toBe(1);
    expect(s.hitLock).toContain(0);

    const from0 = targetsFrom(s, 0);
    expect(from0.length).toBeGreaterThan(0);
    expect(from0.every((m) => m.to === 'off')).toBe(true);
  });

  it('удар ВНЕ своего дома НЕ запирает шашку — обычное продолжение доступно', () => {
    const pts = new Array(24).fill(0);
    pts[13] = 1; pts[20] = 14; pts[10] = -1; pts[0] = -14;
    const s: GameState = { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn: 'w', dice: [3, 2], rolled: [3, 2], variant: 'short' };

    S.applyMove(s, 13, 10, 3); // бой вне дома
    expect(s.pts[10]).toBe(1);
    expect(s.hitLock ?? []).not.toContain(10);
    expect(allowedMoves(s).some((m) => m.from === 10 && m.to === 8)).toBe(true);
  });
});
