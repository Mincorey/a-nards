/* =============================================================================
 * core.ts — Фасад движка: диспетчеризация по варианту партии (state.variant).
 * Клиент и сервер работают с любым вариантом через единый набор функций.
 * ========================================================================== */
import type { Color, GameState, Move, MoveFrom, MoveTo, Rng, Variant } from './types.ts';
import * as S from './shortNardy.ts';
import * as L from './longNardy.ts';

export const WHITE: Color = 'w';
export const BLACK: Color = 'b';
export const opp = (c: Color): Color => (c === WHITE ? BLACK : WHITE);

type Engine = typeof S;
function impl(s: GameState): Engine {
  return s.variant === 'long' ? (L as unknown as Engine) : S;
}

export function initState(variant: Variant = 'short'): GameState {
  return variant === 'long' ? L.initState() : S.initState();
}

export const startTurn = (s: GameState, rng?: Rng) => impl(s).startTurn(s, rng);
export const endTurn = (s: GameState) => impl(s).endTurn(s);
export const allLegalMoves = (s: GameState) => impl(s).allLegalMoves(s);
export const legalMovesFrom = (s: GameState, from: MoveFrom) => impl(s).legalMovesFrom(s, from);
export const applyMove = (s: GameState, from: MoveFrom, to: MoveTo, die: number) => impl(s).applyMove(s, from, to, die);
export const hasAnyMove = (s: GameState) => impl(s).hasAnyMove(s);
export const isGameOver = (s: GameState) => impl(s).isGameOver(s);
export const winner = (s: GameState) => impl(s).winner(s);
export const pipCount = (s: GameState, c: Color) => impl(s).pipCount(s, c);
export const canBearOff = (s: GameState, c: Color, idx: number, d: number) => impl(s).canBearOff(s, c, idx, d);
export const allInHome = (s: GameState, c: Color) => impl(s).allInHome(s, c);
export const checkerCount = (s: GameState, c: Color) => impl(s).checkerCount(s, c);

export function cloneState(s: GameState): GameState {
  const c = impl(s).cloneState(s);
  c.variant = s.variant ?? 'short';
  c.headUsed = s.headUsed;
  return c;
}

export function autoPlayTurn(s: GameState, pick?: (moves: Move[], s: GameState) => Move): Move[] {
  return impl(s).autoPlayTurn(s, pick);
}
