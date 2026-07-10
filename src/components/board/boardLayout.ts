/* =============================================================================
 * boardLayout.ts — Геометрия в координатах РЕАЛЬНОЙ доски (assets/board.png).
 * -----------------------------------------------------------------------------
 * viewBox = размер board.png (1986×1986). Сам ассет рисуется как фон <image>,
 * а пункты/фишки/бар/вынос/кубики позиционируются поверх по этим координатам.
 *
 * Доска — две панели (левая/правая) с центральной перемычкой (= бар).
 * Резные метки сверху/снизу каждой панели = позиции 6 пунктов. Всего 24.
 *
 * Индексы движка → визуальные квадранты (как в стандартной доске, белые 23→0
 * двигаются к своему дому в правой-нижней четверти):
 *   • 0..5   правая панель, низ  (дом БЕЛЫХ): 0 у края, 5 у бара
 *   • 6..11  левая  панель, низ: 6 у бара, 11 у края
 *   • 12..17 левая  панель, верх: 12 у края, 17 у бара
 *   • 18..23 правая панель, верх (дом ЧЁРНЫХ): 18 у бара, 23 у края
 * ========================================================================== */
import type { Color } from '../../engine/types';

export const VB = { w: 1986, h: 1986 };

export const LEFT_PANEL = { x0: 96, x1: 935 };
export const RIGHT_PANEL = { x0: 1059, x1: 1896 };
export const DIVIDER = { x0: LEFT_PANEL.x1, x1: RIGHT_PANEL.x0 }; // 935..1059

export const COL_W = (LEFT_PANEL.x1 - LEFT_PANEL.x0) / 6; // ≈139.8

const TOP_RAIL = 120;
const BOT_RAIL = VB.h - 120; // 1866
export const STACK_LEN = 470; // длина зоны пункта (подогнано под резные метки board.png)
export const CHECKER_R = COL_W * 0.42; // ≈58.7
const PAD = 10;

export type Row = 'top' | 'bottom';
export interface PointGeom {
  index: number;
  cx: number;
  baseY: number;   // у края (рейки), откуда растёт столбик
  dir: 1 | -1;     // +1 вниз (top), -1 вверх (bottom)
  row: Row;
}

function panelColX(panel: { x0: number; x1: number }, col: number): number {
  return panel.x0 + COL_W * (col + 0.5);
}

export function pointGeom(index: number): PointGeom {
  let panel: { x0: number; x1: number };
  let col: number;
  let row: Row;
  if (index <= 5) { panel = RIGHT_PANEL; col = 5 - index; row = 'bottom'; }
  else if (index <= 11) { panel = LEFT_PANEL; col = 11 - index; row = 'bottom'; }
  else if (index <= 17) { panel = LEFT_PANEL; col = index - 12; row = 'top'; }
  else { panel = RIGHT_PANEL; col = index - 18; row = 'top'; }

  const cx = panelColX(panel, col);
  if (row === 'top') return { index, cx, baseY: TOP_RAIL, dir: 1, row };
  return { index, cx, baseY: BOT_RAIL, dir: -1, row };
}

export const ALL_POINTS: PointGeom[] = Array.from({ length: 24 }, (_, i) => pointGeom(i));

/** Прямоугольник зоны клика/подсветки колонки пункта. */
export function pointCell(g: PointGeom): { x: number; y: number; w: number; h: number } {
  const x = g.cx - COL_W / 2;
  const y = g.dir === 1 ? g.baseY : g.baseY - STACK_LEN;
  return { x, y, w: COL_W, h: STACK_LEN };
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
const MID_Y = VB.h / 2;

/** Сбитые фишки на баре: белые ниже кубиков, чёрные выше. */
export function barPos(color: Color, k: number): { cx: number; cy: number } {
  const r = CHECKER_R * 0.85;
  if (color === 'b') return { cx: DIVIDER_CX, cy: MID_Y - 170 - r - k * 2 * r };
  return { cx: DIVIDER_CX, cy: MID_Y + 170 + r + k * 2 * r };
}

/** Радиус вынесенной (мини) фишки в трее. */
export const OFF_R = CHECKER_R * 0.66; // мини-фишки в трее выноса (крупнее)

/** Вынесенные фишки — мини-стопка реальных фишек в перемычке: белые снизу, чёрные сверху. */
export function offPos(color: Color, k: number): { cx: number; cy: number; r: number } {
  const r = OFF_R;
  const step = r * 0.78; // лёгкое перекрытие
  if (color === 'b') return { cx: DIVIDER_CX, cy: TOP_RAIL + 44 + r + k * step, r };
  return { cx: DIVIDER_CX, cy: BOT_RAIL - 44 - r - k * step, r };
}

/** Центр и размер кубиков (на перемычке по центру). */
export const DICE_AREA = { cx: DIVIDER_CX, cy: MID_Y, size: COL_W * 0.78 };
