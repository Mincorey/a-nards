/* =============================================================================
 * longNardy.ts — Движок ДЛИННЫХ нард (Narde). Изоморфен (браузер + Deno).
 * -----------------------------------------------------------------------------
 * Отличия от коротких:
 *  • Старт: все 15 шашек на «голове» (белые — пункт 23, чёрные — пункт 11).
 *  • Оба игрока идут по кругу в ОДНУ сторону (по убыванию «дистанции до выноса»).
 *  • БОЯ НЕТ: пункт с любой шашкой соперника закрыт.
 *  • С «головы» за ход уходит не более ОДНОЙ шашки (headUsed). ИСКЛЮЧЕНИЕ:
 *    на ПЕРВОМ ходу игрока (голова ещё полная) дублями 3-3, 4-4, 6-6 можно снять
 *    с головы ДВЕ шашки.
 *  • Нельзя запирать все 15 шашек соперника сплошным блоком из 6 пунктов
 *    (у соперника всегда должна оставаться хотя бы одна прошедшая шашка).
 *  • Дома: белые — пункты 0..5, чёрные — 12..17; вынос по правилу перебора.
 *
 * Та же сигнатура GameState (pts[24] знаковое), что и в коротких — для общего
 * рендера/правил. «Дистанция до выноса» dist: 1 = ближайший к выносу, 24 = голова.
 * ========================================================================== */
import type { Color, GameState, Move, MoveFrom, MoveTo, Rng } from './types.ts';

export const WHITE: Color = 'w';
export const BLACK: Color = 'b';

const sign = (c: Color): number => (c === WHITE ? 1 : -1);
export const opp = (c: Color): Color => (c === WHITE ? BLACK : WHITE);

const HEAD: Record<Color, number> = { w: 23, b: 11 };

/** Дистанция пункта до выноса для цвета c (1..24; 24 = голова). */
export function toDist(c: Color, i: number): number {
  if (c === WHITE) return i + 1;
  return i >= 12 ? i - 11 : i + 13;
}
/** Физический индекс по дистанции (k>=1); k<=0 — вне доски (вынос). */
function fromDist(c: Color, k: number): number {
  if (c === WHITE) return k - 1;
  return k <= 12 ? k + 11 : k - 13;
}

export function initState(): GameState {
  const pts = new Array<number>(24).fill(0);
  pts[HEAD.w] = +15;
  pts[HEAD.b] = -15;
  return {
    pts,
    bar: { w: 0, b: 0 },
    off: { w: 0, b: 0 },
    turn: WHITE,
    dice: [],
    rolled: null,
    variant: 'long',
    headUsed: 0,
  };
}

export function rollDice(rng: Rng = Math.random): [number, number] {
  return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
}
export function diceToMoves(roll: [number, number]): number[] {
  return roll[0] === roll[1] ? [roll[0], roll[0], roll[0], roll[0]] : [roll[0], roll[1]];
}

/** Куда ведёт ход из i кубиком d: индекс, 'off' или невозможно. */
export function destFor(c: Color, from: MoveFrom, d: number): number | 'off' {
  if (from === 'bar') return 'off'; // бара в длинных нет
  const k = toDist(c, from) - d;
  if (k <= 0) return 'off';
  return fromDist(c, k);
}

const inHome = (c: Color, i: number): boolean => toDist(c, i) <= 6;

/** Все шашки цвета c в доме (условие выноса). */
export function allInHome(s: GameState, c: Color): boolean {
  const sg = sign(c);
  for (let i = 0; i < 24; i++) if (s.pts[i] * sg > 0 && !inHome(c, i)) return false;
  return true;
}

/** Пункт закрыт для c, если на нём есть шашка соперника (бой запрещён). */
const isBlock = (s: GameState, c: Color, i: number): boolean => s.pts[i] * sign(c) < 0;

export function canBearOff(s: GameState, c: Color, idx: number, d: number): boolean {
  if (!allInHome(s, c)) return false;
  if (s.pts[idx] * sign(c) <= 0) return false;
  const pip = toDist(c, idx);
  if (pip === d) return true;
  if (d > pip) {
    // Перебор разрешён только если нет своих шашек дальше от выноса.
    for (let i = 0; i < 24; i++)
      if (s.pts[i] * sign(c) > 0 && toDist(c, i) > pip) return false;
    return true;
  }
  return false;
}

/** Максимум шашек с головы за ЭТОТ ход: обычно 1; на первом ходу игрока
 *  (голова ещё полная — 15) дублями 3-3/4-4/6-6 — 2. «Полнота головы на начало
 *  хода» определяется как headCount + headUsed === 15 (не зависит от того,
 *  сколько уже снято в этом ходу). */
function headMaxForTurn(s: GameState, c: Color): number {
  const headNow = s.pts[HEAD[c]] * sign(c);
  const startedFull = headNow + (s.headUsed ?? 0) === 15;
  const r = s.rolled;
  const specialDouble = !!r && r[0] === r[1] && (r[0] === 3 || r[0] === 4 || r[0] === 6);
  return startedFull && specialDouble ? 2 : 1;
}

/** Есть ли у цвета c сплошной блок из 6 пунктов, запирающий ВСЕ шашки соперника
 *  (ни одной прошедшей). Используется для запрета такого блока. */
function blocksAllOpponent(s: GameState, c: Color): boolean {
  const o = opp(c);
  const so = sign(o);
  const oOff = o === WHITE ? s.off.w : s.off.b;
  const oDists: number[] = [];
  for (let i = 0; i < 24; i++) if (s.pts[i] * so > 0) oDists.push(toDist(o, i));

  for (let start = 0; start < 24; start++) {
    let full = true;
    const dists: number[] = [];
    for (let k = 0; k < 6; k++) {
      const idx = (start + k) % 24;
      if (!(s.pts[idx] * sign(c) > 0)) { full = false; break; }
      dists.push(toDist(o, idx));
    }
    if (!full) continue;
    const dmin = Math.min(...dists);
    const dmax = Math.max(...dists);
    // Прайм должен быть непрерывным и в метрике соперника (иначе он «разорван»
    // на зоне выноса соперника и барьером не является).
    if (dmax - dmin !== 5) continue;
    // Есть ли у соперника хоть одна прошедшая шашка (впереди блока или уже в ауте)?
    const anyAhead = oOff > 0 || oDists.some((d) => d < dmin);
    if (!anyAhead) return true; // все шашки соперника заперты — такой блок запрещён
  }
  return false;
}

/** Создаёт ли ход c→dest НОВЫЙ запирающий 6-блок (которого до хода не было). */
function createsIllegalBlock(s: GameState, alreadyTraps: boolean, from: MoveFrom, dest: number, die: number): boolean {
  if (alreadyTraps) return false; // барьер уже существовал — этот ход его не создаёт
  const ns = cloneState(s);
  applyMove(ns, from, dest, die);
  return blocksAllOpponent(ns, s.turn);
}

export function legalMovesFrom(s: GameState, from: MoveFrom): Move[] {
  if (from === 'bar') return [];
  const c = s.turn;
  if (s.pts[from] * sign(c) <= 0) return [];
  // Правило головы (с учётом исключения первого хода дублями 3/4/6).
  if (from === HEAD[c] && (s.headUsed ?? 0) >= headMaxForTurn(s, c)) return [];
  const alreadyTraps = blocksAllOpponent(s, c);
  const out: Move[] = [];
  const dice = [...new Set(s.dice)];
  for (const d of dice) {
    const dest = destFor(c, from, d);
    if (dest === 'off') {
      if (canBearOff(s, c, from, d)) out.push({ from, to: 'off', die: d });
    } else if (!isBlock(s, c, dest)) {
      if (!createsIllegalBlock(s, alreadyTraps, from, dest, d)) {
        out.push({ from, to: dest, die: d });
      }
    }
  }
  return out;
}

export function allLegalMoves(s: GameState): Move[] {
  const c = s.turn;
  const res: Move[] = [];
  for (let i = 0; i < 24; i++) if (s.pts[i] * sign(c) > 0) res.push(...legalMovesFrom(s, i));
  return res;
}

export const hasAnyMove = (s: GameState): boolean => allLegalMoves(s).length > 0;

export function applyMove(s: GameState, from: MoveFrom, to: MoveTo, die: number): { hit: boolean } {
  const c = s.turn;
  const sg = sign(c);
  if (from !== 'bar' && from === HEAD[c]) s.headUsed = (s.headUsed ?? 0) + 1;
  if (from !== 'bar') s.pts[from] -= sg;
  if (to === 'off') {
    if (c === WHITE) s.off.w++; else s.off.b++;
  } else {
    s.pts[to] += sg; // боя нет — цель всегда своя/пустая
  }
  const di = s.dice.indexOf(die);
  if (di >= 0) s.dice.splice(di, 1);
  return { hit: false };
}

export function endTurn(s: GameState): void {
  s.turn = opp(s.turn);
  s.dice = [];
  s.rolled = null;
  s.headUsed = 0;
}

export function startTurn(s: GameState, rng: Rng = Math.random): [number, number] {
  s.rolled = rollDice(rng);
  s.dice = diceToMoves(s.rolled);
  s.headUsed = 0;
  return s.rolled;
}

export const isGameOver = (s: GameState): boolean => s.off.w === 15 || s.off.b === 15;
export const winner = (s: GameState): Color | null =>
  s.off.w === 15 ? WHITE : s.off.b === 15 ? BLACK : null;

export function pipCount(s: GameState, c: Color): number {
  const sg = sign(c);
  let p = 0;
  for (let i = 0; i < 24; i++) {
    const v = s.pts[i] * sg;
    if (v > 0) p += v * toDist(c, i);
  }
  return p;
}

export function checkerCount(s: GameState, c: Color): number {
  const sg = sign(c);
  let n = c === WHITE ? s.off.w : s.off.b;
  for (let i = 0; i < 24; i++) {
    const v = s.pts[i] * sg;
    if (v > 0) n += v;
  }
  return n;
}

export function cloneState(s: GameState): GameState {
  return {
    pts: s.pts.slice(),
    bar: { ...s.bar },
    off: { ...s.off },
    turn: s.turn,
    dice: s.dice.slice(),
    rolled: s.rolled ? [s.rolled[0], s.rolled[1]] : null,
    variant: 'long',
    headUsed: s.headUsed,
  };
}

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
