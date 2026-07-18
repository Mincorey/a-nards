import { describe, it, expect } from 'vitest';
import {
  allPoints, pointGeom, pointCell, seatX, barPos, offPos,
  VB, MID_Y, LEFT_PANEL, RIGHT_PANEL, type Row, type PanelKey,
} from './boardLayout';

const CX_MID = VB.w / 2;

describe('boardLayout — ориентация доски под игрока', () => {
  it('белая перспектива: дом белых (0..5) внизу-справа, дом чёрных (18..23) вверху-справа', () => {
    const w = allPoints('w');
    expect(w[0].row).toBe('bottom');
    expect(w[0].cx).toBeGreaterThan(CX_MID);
    expect(w[23].row).toBe('top');
    expect(w[23].cx).toBeGreaterThan(CX_MID);
  });

  it('чёрная перспектива: дом ЧЁРНЫХ (18..23) приходит ВНИЗ-справа, дом белых — вверх-справа', () => {
    const b = allPoints('b');
    expect(b[23].row).toBe('bottom');
    expect(b[23].cx).toBeGreaterThan(CX_MID);
    expect(b[0].row).toBe('top');
    expect(b[0].cx).toBeGreaterThan(CX_MID);
  });

  it('отражение вертикальное: y зеркалится, dir инвертируется, cx — из арок зеркальной рейки', () => {
    for (let i = 0; i < 24; i++) {
      const w = pointGeom(i, 'w');
      const b = pointGeom(i, 'b');
      expect(b.baseY).toBeCloseTo(VB.h - w.baseY, 6);
      expect(b.dir).toBe(w.dir === 1 ? -1 : 1);
      expect(b.panel).toBe(w.panel);
      expect(b.col).toBe(w.col);
      expect(b.row).toBe(w.row === 'top' ? 'bottom' : 'top');
      // Фишка садится в арку той рейки, где визуально стоит столбик.
      expect(b.cx).toBeCloseTo(seatX(b.panel, b.row, b.col), 6);
      // Верхняя и нижняя рейки похожи — разбег мал (защита от опечаток в таблице).
      expect(Math.abs(b.cx - w.cx)).toBeLessThan(30);
    }
  });

  it('бар и вынос тоже отражаются по вертикали для чёрного зрителя', () => {
    expect(offPos('w', 0, 'w').cy).toBeGreaterThan(MID_Y);
    expect(offPos('b', 0, 'b').cy).toBeGreaterThan(MID_Y);
    expect(barPos('w', 0, 'w').cy).toBeGreaterThan(MID_Y);
    expect(barPos('b', 0, 'b').cy).toBeGreaterThan(MID_Y);
  });
});

describe('boardLayout — калибровка посадочных арок под board.png', () => {
  it('cx каждого пункта совпадает с измеренной аркой и лежит в границах своей панели', () => {
    for (const viewer of ['w', 'b'] as const) {
      for (const g of allPoints(viewer)) {
        expect(g.cx).toBeCloseTo(seatX(g.panel, g.row, g.col), 6);
        const p = g.panel === 'L' ? LEFT_PANEL : RIGHT_PANEL;
        expect(g.cx).toBeGreaterThan(p.x0);
        expect(g.cx).toBeLessThan(p.x1);
      }
    }
  });

  it('правая панель — та же рейка со сдвигом ровно 961px', () => {
    for (const row of ['top', 'bottom'] as Row[]) {
      for (let col = 0; col < 6; col++) {
        expect(seatX('R', row, col) - seatX('L', row, col)).toBeCloseTo(961, 6);
      }
    }
  });

  it('арки в рейке идут строго по возрастанию с разумным шагом', () => {
    for (const row of ['top', 'bottom'] as Row[]) {
      for (const panel of ['L', 'R'] as PanelKey[]) {
        for (let col = 0; col < 5; col++) {
          const gap = seatX(panel, row, col + 1) - seatX(panel, row, col);
          expect(gap).toBeGreaterThan(100);
          expect(gap).toBeLessThan(180);
        }
      }
    }
  });

  it('клетки кликов одной рейки стыкуются без дыр и перекрытий и покрывают панель', () => {
    for (const viewer of ['w', 'b'] as const) {
      const pts = allPoints(viewer);
      for (const panel of ['L', 'R'] as PanelKey[]) {
        for (const row of ['top', 'bottom'] as Row[]) {
          const group = pts
            .filter((g) => g.panel === panel && g.row === row)
            .sort((a, b) => a.col - b.col);
          expect(group.length).toBe(6);
          const pb = panel === 'L' ? LEFT_PANEL : RIGHT_PANEL;
          const cells = group.map((g) => pointCell(g));
          expect(cells[0].x).toBeCloseTo(pb.x0, 6);
          expect(cells[5].x + cells[5].w).toBeCloseTo(pb.x1, 6);
          for (let i = 0; i < 5; i++) {
            expect(cells[i].x + cells[i].w).toBeCloseTo(cells[i + 1].x, 6);
          }
          // Центр арки — внутри своей клетки.
          for (let i = 0; i < 6; i++) {
            expect(group[i].cx).toBeGreaterThan(cells[i].x);
            expect(group[i].cx).toBeLessThan(cells[i].x + cells[i].w);
          }
        }
      }
    }
  });
});
