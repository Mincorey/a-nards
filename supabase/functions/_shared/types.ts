/* АВТО-СГЕНЕРИРОВАНО из src/engine/types.ts (scripts/sync-server-engine.mjs) — НЕ редактировать. */
/** Цвет игрока: белые / чёрные. */
export type Color = 'w' | 'b';

/** Вариант игры: короткие (backgammon) или длинные нарды. */
export type Variant = 'short' | 'long';

/** Источник хода: индекс пункта 0..23 или вход с бара. */
export type MoveFrom = number | 'bar';
/** Цель хода: индекс пункта 0..23 или вынос за край. */
export type MoveTo = number | 'off';

/** Один элементарный ход одной шашки на один кубик. */
export interface Move {
  from: MoveFrom;
  to: MoveTo;
  die: number;
}

/**
 * Состояние партии.
 * pts[i] — знаковое: >0 белые, <0 чёрные, 0 пусто (индексы 0..23).
 */
export interface GameState {
  pts: number[];
  bar: { w: number; b: number };
  off: { w: number; b: number };
  turn: Color;
  dice: number[];
  rolled: [number, number] | null;
  /** Вариант партии (по умолчанию 'short', если не задан). */
  variant?: Variant;
  /** Длинные нарды: сколько шашек уже ушло с «головы» за текущий ход. */
  headUsed?: number;
}

/** Функция генерации случайного числа [0,1) — для подмены ГСЧ (seed/тесты). */
export type Rng = () => number;
