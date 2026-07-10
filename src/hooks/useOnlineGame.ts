/* =============================================================================
 * useOnlineGame.ts — Онлайн-партия: состояние из БД, ходы через Edge Functions,
 * обновления соперника через Realtime. Совместим с пропсами <Board>.
 * ========================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Color, GameState } from '../engine/types';
import type { GameRow } from '../lib/online.types';
import { getActiveGame, playMove, rollDice, subscribeTable } from '../lib/online';
import { targetsFrom, legalSources } from '../game/rules';

export type Spot = number | 'bar' | 'off';
export type OnlinePhase = 'loading' | 'myRoll' | 'myMove' | 'opponent' | 'gameover';

export interface UseOnlineGame {
  game: GameRow | null;
  state: GameState | null;
  phase: OnlinePhase;
  myColor: Color | null;
  selected: Spot | null;
  sources: Set<number | 'bar'>;
  targets: { to: number | 'off' }[];
  message: string;
  busy: boolean;
  error: string | null;
  rollId: number;
  roll: () => void;
  pick: (spot: Spot) => void;
}

export function useOnlineGame(tableId: string, myColor: Color | null): UseOnlineGame {
  const [game, setGame] = useState<GameRow | null>(null);
  const [selected, setSelected] = useState<Spot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    getActiveGame(tableId).then((g) => { if (active) setGame(g); }).catch(() => {});
    return () => { active = false; };
  }, [tableId]);

  useEffect(() => {
    const unsub = subscribeTable(tableId, {
      onGame: (g) => { if (mounted.current) { setGame(g); setSelected(null); } },
    }, 'game');
    return unsub;
  }, [tableId]);

  const state = game?.state ?? null;
  const myTurn = Boolean(game && myColor && game.turn === myColor && game.status === 'playing');

  const phase: OnlinePhase = useMemo(() => {
    if (!game) return 'loading';
    if (game.status === 'finished') return 'gameover';
    if (!myColor) return 'opponent';
    if (game.turn !== myColor) return 'opponent';
    return state?.rolled ? 'myMove' : 'myRoll';
  }, [game, myColor, state]);

  const sources = useMemo(
    () => (myTurn && state?.rolled ? legalSources(state) : new Set<number | 'bar'>()),
    [myTurn, state],
  );
  const targets = useMemo(
    () => (myTurn && state?.rolled && selected !== null ? targetsFrom(state, selected as number | 'bar') : []),
    [myTurn, state, selected],
  );

  const rollId = game ? game.ply * 2 + (state?.rolled ? 1 : 0) : 0;

  const roll = useCallback(() => {
    if (!game || phase !== 'myRoll' || busy) return;
    setBusy(true); setError(null);
    rollDice(game.id)
      .then((r) => { if (mounted.current) setGame(r.game); })
      .catch((e) => { if (mounted.current) setError(e instanceof Error ? e.message : 'Ошибка броска'); })
      .finally(() => { if (mounted.current) setBusy(false); });
  }, [game, phase, busy]);

  const pick = useCallback((spot: Spot) => {
    if (!game || phase !== 'myMove' || busy || !state) return;
    const srcs = legalSources(state);

    if (selected !== null) {
      const from = selected as number | 'bar';
      const mv = targetsFrom(state, from).find((m) => m.to === spot);
      if (mv) {
        setBusy(true); setError(null);
        setSelected(null);
        playMove(game.id, mv)
          .then((r) => { if (mounted.current) setGame(r.game); })
          .catch((e) => { if (mounted.current) setError(e instanceof Error ? e.message : 'Ошибка хода'); })
          .finally(() => { if (mounted.current) setBusy(false); });
        return;
      }
      if (spot === selected) { setSelected(null); return; }
    }
    if ((spot === 'bar' || typeof spot === 'number') && srcs.has(spot as number | 'bar')) {
      setSelected(spot);
      return;
    }
    setSelected(null);
  }, [game, phase, busy, state, selected]);

  const message = useMemo(() => {
    if (error) return error;
    switch (phase) {
      case 'loading': return 'Загрузка партии…';
      case 'myRoll': return 'Ваш ход — бросьте кубики';
      case 'myMove': return busy ? 'Ход…' : 'Выберите шашку и ход';
      case 'opponent': return myColor ? 'Ход соперника…' : 'Идёт партия';
      case 'gameover': return game?.winner === myColor ? 'Вы победили!' : 'Партия завершена';
      default: return '';
    }
  }, [phase, busy, error, myColor, game]);

  useEffect(() => { setSelected(null); }, [game?.ply, game?.turn]);

  return {
    game, state, phase, myColor, selected, sources, targets, message, busy, error, rollId,
    roll, pick,
  };
}
