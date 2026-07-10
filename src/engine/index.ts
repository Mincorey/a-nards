export * from './types.ts';
export * as ShortNardy from './shortNardy.ts';
export * as LongNardy from './longNardy.ts';
// Фасад с диспетчеризацией по варианту партии (state.variant).
export {
  initState, startTurn, endTurn, allLegalMoves, legalMovesFrom, applyMove,
  hasAnyMove, isGameOver, winner, pipCount, canBearOff, allInHome,
  checkerCount, cloneState, autoPlayTurn, opp, WHITE, BLACK,
} from './core.ts';
