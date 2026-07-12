import { describe, it, expect } from 'vitest';
import { allPoints, pointGeom, barPos, offPos, VB, MID_Y } from './boardLayout';

const CX_MID = VB.w / 2;

describe('boardLayout — ориентация доски под игрока', () => {
  it('белая перспектива: дом белых (0..5) внизу-справа, дом чёрных (18..23) вверху-справа', () => {
    const w = allPoints('w');
    // угол дома белых (0) — низ, правая половина
    expect(w[0].row).toBe('bottom');
    expect(w[0].cx).toBeGreaterThan(CX_MID);
    // угол дома чёрных (23) — верх, правая половина
    expect(w[23].row).toBe('top');
    expect(w[23].cx).toBeGreaterThan(CX_MID);
  });

  it('чёрная перспектива: дом ЧЁРНЫХ (18..23) приходит ВНИЗ-справа, дом белых — вверх-справа', () => {
    const b = allPoints('b');
    // угол дома чёрных (23) теперь НИЗ, правая половина
    expect(b[23].row).toBe('bottom');
    expect(b[23].cx).toBeGreaterThan(CX_MID);
    // угол дома белых (0) теперь ВЕРХ, правая половина
    expect(b[0].row).toBe('top');
    expect(b[0].cx).toBeGreaterThan(CX_MID);
  });

  it('отражение вертикальное: cx сохраняется, y зеркалится по центру, dir инвертируется', () => {
    for (let i = 0; i < 24; i++) {
      const w = pointGeom(i, 'w');
      const b = pointGeom(i, 'b');
      expect(b.cx).toBeCloseTo(w.cx, 6);
      expect(b.baseY).toBeCloseTo(VB.h - w.baseY, 6);
      expect(b.dir).toBe(w.dir === 1 ? -1 : 1);
    }
  });

  it('бар и вынос тоже отражаются по вертикали для чёрного зрителя', () => {
    // Вынос своих фишек у игрока должен быть в его домашней (нижней) половине.
    // Белый зритель: белый вынос снизу (cy > середина).
    expect(offPos('w', 0, 'w').cy).toBeGreaterThan(MID_Y);
    // Чёрный зритель: чёрный вынос теперь снизу (cy > середина).
    expect(offPos('b', 0, 'b').cy).toBeGreaterThan(MID_Y);
    // Бар: своя сбитая фишка ближе к своей (нижней) половине.
    expect(barPos('w', 0, 'w').cy).toBeGreaterThan(MID_Y);
    expect(barPos('b', 0, 'b').cy).toBeGreaterThan(MID_Y);
  });
});
