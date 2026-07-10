/* =============================================================================
 * shortNardy.ts — Движок правил классических (коротких) нард / backgammon (TS)
 * -----------------------------------------------------------------------------
 * Перенос проверенного nardy-engine.js на TypeScript с типами.
 * Изоморфен: работает в браузере и в Deno (Edge Function) — без DOM-зависимостей.
 * ГСЧ можно подменить (seed/детерминизм) — все функции броска принимают Rng.
 * ========================================================================== */
import type { Color, GameState, Move, MoveFrom, MoveTo, Rng } from './types.ts';

export const WHITE: Color = 'w';
export const BLACK: Color = 'b';

/** Создать начальное состояние партии (стандартная расстановка). */
export function initState(): GameState {
  const pts = new Array<number>(24).fill(0);
  // Белые (+):
  pts[23] = +2; pts[12] = +5; pts[7] = +3; pts[5] = +5;
  // Чёрные (−):
  pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
  return {
    pts,
    bar: { w: 0, b: 0 },
    off: { w: 0, b: 0 },
    turn: WHITE,
    dice: [],
    rolled: null,
    variant: 'short',
  };
}

const sign = (c: Color): number => (c === WHITE ? 1 : -1);
export const opp = (c: Color): Color => (c === WHITE ? BLACK : WHITE);

/** Бросок двух кубиков → [a,b], значения 1..6. */
export function rollDice(rng: Rng = Math.random): [number, number] {
  return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
}

/** Преобразовать выпавший бросок в список ходов (дубль = 4 хода). */
export function diceToMoves(roll: [number, number]): number[] {
  return roll[0] === roll[1] ? [roll[0], roll[0], roll[0], roll[0]] : [roll[0], roll[1]];
}

/** Куда ведёт ход из `from` кубиком `d` для цвета `c`: индекс, 'off' или вне 0..23. */
export function destFor(c: Color, from: MoveFrom, d: number): number | 'off' {
  if (from === 'bar') return c === WHITE ? 24 - d : d - 1;
  const t = c === WHITE ? from - d : from + d;
  if (c === WHITE && t < 0) return 'off';
  if (c === BLACK && t > 23) return 'off';
  return t;
}

const inHome = (c: Color, idx: number): boolean =>
  c === WHITE ? idx >= 0 && idx <= 5 : idx >= 18 && idx <= 23;

/** Все ли шашки цвета `c` в своём доме (условие для выноса). */
export function allInHome(s: GameState, c: Color): boolean {
  if ((c === WHITE ? s.bar.w : s.bar.b) > 0) return false;
  const sg = sign(c);
  for (let i = 0; i < 24; i++) if (s.pts[i] * sg > 0 && !inHome(c, i)) return false;
  return true;
}

/** Пункт `idx` закрыт для цвета `c` (≥2 шашки соперника)? */
const isBlock = (s: GameState, c: Color, idx: number): boolean => s.pts[idx] * sign(c) <= -2;

/** Дистанция пункта от края выноса (1 = ближайший к выносу). */
const pipFromEdge = (c: Color, idx: number): number => (c === WHITE ? idx + 1 : 24 - idx);

/** Можно ли выносить шашку с `idx` кубиком `d`? (с учётом «перебора»). */
export function canBearOff(s: GameState, c: Color, idx: number, d: number): boolean {
  if (!allInHome(s, c)) return false;
  if (s.pts[idx] * sign(c) <= 0) return false;
  const pip = pipFromEdge(c, idx);
  if (pip === d) return true;
  if (d > pip) {
    for (let i = 0; i < 24; i++)
      if (s.pts[i] * sign(c) > 0 && inHome(c, i) && pipFromEdge(c, i) > pip) return false;
    return true;
  }
  return false;
}

/** Легальные ходы из конкретного источника для текущего состояния кубиков. */
export function legalMovesFrom(s: GameState, from: MoveFrom): Move[] {
  const c = s.turn;
  const out: Move[] = [];
  const dice = [...new Set(s.dice)];
  const onBar = c === WHITE ? s.bar.w : s.bar.b;
  if (onBar > 0 && from !== 'bar') return out;
  for (const d of dice) {
    if (from === 'bar') {
      const dest = destFor(c, 'bar', d);
      if (dest !== 'off' && !isBlock(s, c, dest)) out.push({ from: 'bar', to: dest, die: d });
      continue;
    }
    if (s.pts[from] * sign(c) <= 0) continue;
    const dest = destFor(c, from, d);
    if (dest === 'off') {
      if (canBearOff(s, c, from, d)) out.push({ from, to: 'off', die: d });
    } else if (!isBlock(s, c, dest)) {
      out.push({ from, to: dest, die: d });
    }
  }
  return out;
}

/** Все легальные ходы текущего игрока во всём состоянии. */
export function allLegalMoves(s: GameState): Move[] {
  const c = s.turn;
  const onBar = c === WHITE ? s.bar.w : s.bar.b;
  if (onBar > 0) return legalMovesFrom(s, 'bar');
  const res: Move[] = [];
  for (let i = 0; i < 24; i++) if (s.pts[i] * sign(c) > 0) res.push(...legalMovesFrom(s, i));
  return res;
}

/** Есть ли хоть один ход. */
export const hasAnyMove = (s: GameState): boolean => allLegalMoves(s).length > 0;

/** Применить конкретный ход (мутирует s). @returns был ли сбит блот соперника. */
export function applyMove(s: GameState, from: MoveFrom, to: MoveTo, die: number): { hit: boolean } {
  const c = s.turn;
  const sg = sign(c);
  if (from === 'bar') {
    if (c === WHITE) s.bar.w--; else s.bar.b--;
  } else {
    s.pts[from] -= sg;
  }
  let hit = false;
  if (to === 'off') {
    if (c === WHITE) s.off.w++; else s.off.b++;
  } else {
    if (s.pts[to] * sg === -1) {
      s.pts[to] = 0;
      if (c === WHITE) s.bar.b++; else s.bar.w++;
      hit = true;
    }
    s.pts[to] += sg;
  }
  const di = s.dice.indexOf(die);
  if (di >= 0) s.dice.splice(di, 1);
  return { hit };
}

/** Передать ход сопернику (очистить кубики). */
export function endTurn(s: GameState): void {
  s.turn = opp(s.turn);
  s.dice = [];
  s.rolled = null;
}

/** Начать ход: бросить и заполнить s.dice. @returns выпавший бросок [a,b]. */
export function startTurn(s: GameState, rng: Rng = Math.random): [number, number] {
  s.rolled = rollDice(rng);
  s.dice = diceToMoves(s.rolled);
  return s.rolled;
}

export const isGameOver = (s: GameState): boolean => s.off.w === 15 || s.off.b === 15;
export const winner = (s: GameState): Color | null =>
  s.off.w === 15 ? WHITE : s.off.b === 15 ? BLACK : null;

/** Pip-счёт игрока (сумма очков до полного выноса; меньше — лучше). */
export function pipCount(s: GameState, c: Color): number {
  let p = (c === WHITE ? s.bar.w : s.bar.b) * 25;
  for (let i = 0; i < 24; i++) {
    const v = s.pts[i];
    if (c === WHITE && v > 0) p += v * (i + 1);
    if (c === BLACK && v < 0) p += -v * (24 - i);
  }
  return p;
}

/** Контроль целостности: всего шашек у цвета (всегда 15). */
export function checkerCount(s: GameState, c: Color): number {
  const sg = sign(c);
  let n = (c === WHITE ? s.bar.w : s.bar.b) + (c === WHITE ? s.off.w : s.off.b);
  for (let i = 0; i < 24; i++) {
    const v = s.pts[i] * sg;
    if (v > 0) n += v;
  }
  return n;
}

/** Глубокая копия состояния (для ИИ/перебора). */
export function cloneState(s: GameState): GameState {
  return {
    pts: s.pts.slice(),
    bar: { ...s.bar },
    off: { ...s.off },
    turn: s.turn,
    dice: s.dice.slice(),
    rolled: s.rolled ? [s.rolled[0], s.rolled[1]] : null,
    variant: s.variant ?? 'short',
    headUsed: s.headUsed,
  };
}

/** Примитивный ИИ-ход: жадно разыгрывает все кубики (заготовка под нормального бота). */
export function autoPlayTurn(
  s: GameState,
  pick: (moves: Move[], s: GameState) => Move = (moves) => moves[Math.floor(Math.random() * moves.length)],
): Move[] {
  const played: Move[] = [];
  let guard = 0;
  while (s.dice.length > 0 && guard++ < 60) {
    const moves = allLegalMoves(s);
    if (moves.length === 0) break;
    const mv = pick(moves, s);
   
    applyMove(s, mv.from, mv.to, mv.die);
    played.push(mv);
  }
  return played;
}
