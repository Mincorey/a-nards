/* =============================================================================
 * boardLayout.ts — Геометрия в координатах РЕАЛЬНОЙ доски (assets/board.png).
 * -----------------------------------------------------------------------------
 * viewBox = размер board.png (1986×1986). Сам ассет рисуется как фон <image>,
 * а пункты/фишки/бар/вынос/кубики позиционируются поверх по этим координатам.
 *
 * Доска — две панели (левая/правая) с центральной перемычкой (= бар).
 * Резные метки сверху/снизу каждой панели = позиции 6 пунктов. Всего 24.
 *
 * ПОСАДОЧНЫЕ АРКИ (калибровка 2026-07-18). board.png — фотография настоящей
 * резной доски, и посадочные арки-выемки на рейках вырезаны НЕРАВНОМЕРНО
 * (ручная работа). Раньше центры колонок считались равномерной формулой
 * x0 + COL_W·(col+0.5) — из-за этого крайние стопки промахивались мимо выемок
 * до ~25px (визуально «шашка не сидит в своём месте»). Теперь центры взяты из
 * ЗАМЕРА самой картинки (анализ контура кромки + визуальная сверка):
 *   • обе панели — одна и та же рейка: правая = левая + 961px (совпадение
 *     по всем 6 аркам с точностью <1px);
 *   • верхняя и нижняя рейки РАЗНЫЕ (разбег до ~26px по колонке 6), поэтому
 *     калибровка хранится отдельно для верха и низа.
 *
 * Индексы движка → визуальные квадранты (белая перспектива, viewer='w'):
 *   • 0..5   правая панель, низ  (дом БЕЛЫХ): 0 у края, 5 у бара
 *   • 6..11  левая  панель, низ: 6 у бара, 11 у края
 *   • 12..17 левая  панель, верх: 12 у края, 17 у бара
 *   • 18..23 правая панель, верх (дом ЧЁРНЫХ): 18 у бара, 23 у края
 *
 * ОРИЕНТАЦИЯ ПОД ИГРОКА (viewer). Каждый игрок должен видеть СВОЙ дом в
 * правой-нижней четверти. Для белых это уже так. Для чёрных (их дом 18..23 —
 * правый-ВЕРХ) отражаем раскладку по вертикали (верх↔низ): дом чёрных приходит
 * в правый-низ. При отражении столбик визуально растёт с ДРУГОЙ рейки, поэтому
 * cx берётся из арок именно той рейки, где столбик оказался (верхняя и нижняя
 * рейки чуть различаются). Сами фишки/цифры НЕ переворачиваем.
 * ========================================================================== */
import type { Color } from '../../engine/types';

export const VB = { w: 1986, h: 1986 };

export const LEFT_PANEL = { x0: 96, x1: 935 };
export const RIGHT_PANEL = { x0: 1059, x1: 1896 };
export const DIVIDER = { x0: LEFT_PANEL.x1, x1: RIGHT_PANEL.x0 }; // 935..1059

export const COL_W = (LEFT_PANEL.x1 - LEFT_PANEL.x0) / 6; // ≈139.8 (ср. ширина колонки)

const TOP_RAIL = 120;
const BOT_RAIL = VB.h - 120; // 1866
export const STACK_LEN = 470; // длина зоны пункта (подогнано под резные метки board.png)
export const CHECKER_R = COL_W * 0.42; // ≈58.7
const PAD = 10;

export type Row = 'top' | 'bottom';
export type PanelKey = 'L' | 'R';

/** Измеренные центры посадочных арок ЛЕВОЙ панели (колонки слева направо).
 *  Правая панель — та же рейка со сдвигом SEAT_DX_RIGHT. */
const SEAT_X_LEFT: Record<Row, number[]> = {
  top:    [183, 315, 447, 584, 712.5, 847],
  bottom: [193.5, 322, 456, 587.5, 719.5, 854.5],
};
const SEAT_DX_RIGHT = 961;

/** Центр посадочной арки: панель + рейка (верх/низ) + колонка (0..5 слева направо). */
export function seatX(panel: PanelKey, row: Row, col: number): number {
  const x = SEAT_X_LEFT[row][col];
  return panel === 'L' ? x : x + SEAT_DX_RIGHT;
}

/** Вертикальное отражение координаты y (для перспективы чёрного игрока). */
function reflectY(y: number): number { return VB.h - y; }

export interface PointGeom {
  index: number;
  cx: number;
  baseY: number;   // у края (рейки), откуда растёт столбик
  dir: 1 | -1;     // +1 вниз (top), -1 вверх (bottom)
  row: Row;
  panel: PanelKey;
  col: number;     // колонка в панели, 0..5 слева направо
}

export function pointGeom(index: number, viewer: Color = 'w'): PointGeom {
  let panel: PanelKey;
  let col: number;
  let row: Row;
  if (index <= 5) { panel = 'R'; col = 5 - index; row = 'bottom'; }
  else if (index <= 11) { panel = 'L'; col = 11 - index; row = 'bottom'; }
  else if (index <= 17) { panel = 'L'; col = index - 12; row = 'top'; }
  else { panel = 'R'; col = index - 18; row = 'top'; }

  // Перспектива чёрного — отражаем по вертикали: столбик уходит на другую рейку.
  if (viewer === 'b') row = row === 'top' ? 'bottom' : 'top';

  const cx = seatX(panel, row, col);
  const baseY = row === 'top' ? TOP_RAIL : BOT_RAIL;
  const dir: 1 | -1 = row === 'top' ? 1 : -1;
  return { index, cx, baseY, dir, row, panel, col };
}

/** Раскладка всех 24 пунктов для перспективы игрока. */
export function allPoints(viewer: Color = 'w'): PointGeom[] {
  return Array.from({ length: 24 }, (_, i) => pointGeom(i, viewer));
}

/** Белая перспектива (для обратной совместимости/тестов). */
export const ALL_POINTS: PointGeom[] = allPoints('w');

/** Прямоугольник зоны клика/подсветки колонки пункта.
 *  Границы — ПОСЕРЕДИНЕ между соседними арками (арки вырезаны неравномерно;
 *  при единой ширине COL_W соседние зоны налезали бы друг на друга), крайние —
 *  по границам панели. Зоны одной рейки стыкуются без дыр и перекрытий. */
export function pointCell(g: PointGeom): { x: number; y: number; w: number; h: number } {
  const p = g.panel === 'L' ? LEFT_PANEL : RIGHT_PANEL;
  const left = g.col === 0 ? p.x0 : (seatX(g.panel, g.row, g.col - 1) + g.cx) / 2;
  const right = g.col === 5 ? p.x1 : (g.cx + seatX(g.panel, g.row, g.col + 1)) / 2;
  const y = g.dir === 1 ? g.baseY : g.baseY - STACK_LEN;
  return { x: left, y, w: right - left, h: STACK_LEN };
}

export function checkerPos(g: PointGeom, k: number, count: number): { cx: number; cy: number } {
  const r = CHECKER_R;
  const span = STACK_LEN - 2 * r - PAD;
  let step = 2 * r * 0.64; // компактнее — стопки ложатся точно на посадочные места
  if (count > 1 && (count - 1) * step > span) step = span / (count - 1);
  const cy = g.baseY + g.dir * (PAD + r + k * step);
  return { cx: g.cx, cy };
}

const DIVIDER_CX = (DIVIDER.x0 + DIVIDER.x1) / 2; // ≈997
export const MID_Y = VB.h / 2;

/** Сбитые фишки на баре: белые ниже кубиков, чёрные выше (в белой перспективе). */
export function barPos(color: Color, k: number, viewer: Color = 'w'): { cx: number; cy: number } {
  const r = CHECKER_R * 0.85;
  let cy = color === 'b' ? MID_Y - 170 - r - k * 2 * r : MID_Y + 170 + r + k * 2 * r;
  if (viewer === 'b') cy = reflectY(cy);
  return { cx: DIVIDER_CX, cy };
}

/** Радиус вынесенной (мини) фишки в трее. */
export const OFF_R = CHECKER_R * 0.66; // мини-фишки в трее выноса (крупнее)

/** Вынесенные фишки — мини-стопка в перемычке: белые снизу, чёрные сверху (белая перспектива). */
export function offPos(color: Color, k: number, viewer: Color = 'w'): { cx: number; cy: number; r: number } {
  const r = OFF_R;
  const step = r * 0.78; // лёгкое перекрытие
  let cy = color === 'b' ? TOP_RAIL + 44 + r + k * step : BOT_RAIL - 44 - r - k * step;
  if (viewer === 'b') cy = reflectY(cy);
  return { cx: DIVIDER_CX, cy, r };
}

/** Центр и размер кубиков (на перемычке по центру — при отражении не меняется). */
export const DICE_AREA = { cx: DIVIDER_CX, cy: MID_Y, size: COL_W * 0.78 };
