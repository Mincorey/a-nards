import { describe, it, expect } from 'vitest';
import { isNewerGameRow, type GameRowOrd } from './gameOrder';

/** Фабрика строки партии с разумными значениями по умолчанию. */
function row(over: Partial<GameRowOrd> = {}): GameRowOrd {
  return {
    id: 'g1',
    status: 'playing',
    ply: 10,
    rolled: null,
    updated_at: '2026-07-19T10:00:00.000Z',
    state: { dice: [] },
    ...over,
  };
}

describe('isNewerGameRow — логический порядок строк партии', () => {
  it('нет текущей строки → принимаем любую', () => {
    expect(isNewerGameRow(null, row())).toBe(true);
  });

  it('другая партия (реванш) → принимаем всегда, даже с меньшим ply', () => {
    const cur = row({ ply: 20 });
    const next = row({ id: 'g2', ply: 0, updated_at: '2026-07-19T09:00:00.000Z' });
    expect(isNewerGameRow(cur, next)).toBe(true);
  });

  it('больший ply → новее; меньший → отбрасываем', () => {
    const cur = row({ ply: 10 });
    expect(isNewerGameRow(cur, row({ ply: 11, updated_at: '2026-07-19T09:00:00.000Z' }))).toBe(true);
    expect(isNewerGameRow(cur, row({ ply: 9, updated_at: '2026-07-19T11:00:00.000Z' }))).toBe(false);
  });

  it('равный ply: «кости брошены» новее, чем «не брошены»', () => {
    const cur = row({ rolled: null });
    const rolledRow = row({ rolled: [6, 3], state: { dice: [6, 3] }, updated_at: '2026-07-19T09:00:00.000Z' });
    expect(isNewerGameRow(cur, rolledRow)).toBe(true);
    expect(isNewerGameRow(rolledRow, cur)).toBe(false);
  });

  it('СЦЕНАРИЙ ФАНТОМНОГО БРОСКА: промежуточный полуход цепочки НЕ перетирает оптимистичный конец хода', () => {
    // Оптимистично применили всю цепочку: ход передан (ply+1, кости сняты).
    const optimistic = row({ ply: 11, rolled: null, state: { dice: [] }, updated_at: '2026-07-19T10:00:00.000Z' });
    // Из Realtime прилетает строка ПЕРВОГО полухода: ply прежний, кости ещё на
    // столе, updated_at СВЕЖЕЕ (сервер писал позже). Раньше это принималось по
    // времени → UI откатывался → повторная анимация костей.
    const intermediate = row({ ply: 10, rolled: [6, 3], state: { dice: [3] }, updated_at: '2026-07-19T10:00:01.000Z' });
    expect(isNewerGameRow(optimistic, intermediate)).toBe(false);
    // Финальная строка сервера (тот же прогресс, свежее время) — принимается.
    const final = row({ ply: 11, rolled: null, state: { dice: [] }, updated_at: '2026-07-19T10:00:02.000Z' });
    expect(isNewerGameRow(optimistic, final)).toBe(true);
  });

  it('равный ply, кости брошены: меньше оставшихся кубиков = новее', () => {
    const cur = row({ rolled: [6, 3], state: { dice: [6, 3] } });
    const after1 = row({ rolled: [6, 3], state: { dice: [3] }, updated_at: '2026-07-19T09:00:00.000Z' });
    expect(isNewerGameRow(cur, after1)).toBe(true);
    expect(isNewerGameRow(after1, cur)).toBe(false);
  });

  it('полное равенство прогресса → решает updated_at (дубль второго канала отбрасывается)', () => {
    const cur = row({ rolled: [4, 2], state: { dice: [4, 2] } });
    const dupOld = row({ rolled: [4, 2], state: { dice: [4, 2] }, updated_at: '2026-07-19T10:00:00.000Z' });
    const fresh = row({ rolled: [4, 2], state: { dice: [4, 2] }, updated_at: '2026-07-19T10:00:05.000Z' });
    expect(isNewerGameRow(cur, dupOld)).toBe(false); // то же время → дубль
    expect(isNewerGameRow(cur, fresh)).toBe(true);
  });

  it('finished принимается всегда (сдача/таймаут не двигают ply)', () => {
    const cur = row({ ply: 30 });
    const fin = row({ ply: 12, status: 'finished', updated_at: '2026-07-19T09:00:00.000Z' });
    expect(isNewerGameRow(cur, fin)).toBe(true);
  });

  it('после finished принимаем только более свежий дубль завершения', () => {
    const fin = row({ status: 'finished', updated_at: '2026-07-19T10:00:00.000Z' });
    expect(isNewerGameRow(fin, row({ status: 'playing', ply: 99, updated_at: '2026-07-19T11:00:00.000Z' }))).toBe(false);
    expect(isNewerGameRow(fin, row({ status: 'finished', updated_at: '2026-07-19T11:00:00.000Z' }))).toBe(true);
    expect(isNewerGameRow(fin, row({ status: 'finished', updated_at: '2026-07-19T09:00:00.000Z' }))).toBe(false);
  });
});
