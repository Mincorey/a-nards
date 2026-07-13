/* =============================================================================
 * useOnlineGame.ts — Онлайн-партия: состояние из БД, ходы через Edge Functions,
 * обновления соперника через Realtime. Совместим с пропсами <Board>.
 * ========================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Color, GameState } from '../engine/types';
import type { GameRow } from '../lib/online.types';
import { getActiveGame, playMove, rollDice, subscribeTable, createGameSync } from '../lib/online';
import { targetsFrom, legalSources, allowedMoves } from '../game/rules';
import * as E from '../engine/core';

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
  // Последняя известная строка партии — синхронный источник для дедупа входящих
  // (broadcast и postgres_changes могут принести одно и то же) и база для отката.
  const gameRef = useRef<GameRow | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Применить пришедшую извне строку партии. Берём только БОЛЕЕ СВЕЖУЮ версию
  // (по updated_at) — так дубликат из второго канала и любые запоздавшие события
  // молча отбрасываются, без лишней переанимации.
  const applyIncoming = useCallback((row: GameRow | null) => {
    if (!row) return;
    const cur = gameRef.current;
    if (cur && row.updated_at && cur.updated_at && row.updated_at <= cur.updated_at) return;
    gameRef.current = row;
    setGame(row);
    setSelected(null);
  }, []);

  // Быстрый канал синхронизации (Realtime broadcast) — один на стол.
  const sync = useMemo(() => createGameSync(tableId), [tableId]);

  useEffect(() => {
    let active = true;
    getActiveGame(tableId).then((g) => { if (active && mounted.current) applyIncoming(g); }).catch(() => {});
    return () => { active = false; };
  }, [tableId, applyIncoming]);

  // Ход соперника приходит двумя каналами: broadcast (быстро, <100 мс) и
  // postgres_changes (надёжный запас). Дедуп по updated_at в applyIncoming.
  useEffect(() => {
    const unsubBroadcast = sync.subscribe((row) => { if (mounted.current) applyIncoming(row); });
    const unsubPg = subscribeTable(tableId, {
      onGame: (g) => { if (mounted.current) applyIncoming(g); },
    }, 'game');
    return () => { unsubBroadcast(); unsubPg(); };
  }, [tableId, sync, applyIncoming]);

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
      .then((r) => {
        if (!mounted.current) return;
        applyIncoming(r.game);   // авторитетный бросок сервера
        sync.send(r.game);       // мгновенно показать бросок сопернику
      })
      .catch((e) => { if (mounted.current) setError(e instanceof Error ? e.message : 'Ошибка броска'); })
      .finally(() => { if (mounted.current) setBusy(false); });
  }, [game, phase, busy, applyIncoming, sync]);

  const pick = useCallback((spot: Spot) => {
    if (!game || phase !== 'myMove' || busy || !state) return;
    const srcs = legalSources(state);

    if (selected !== null) {
      const from = selected as number | 'bar';
      const mv = targetsFrom(state, from).find((m) => m.to === spot);
      if (mv) {
        // 1) ОПТИМИСТИЧНО применяем ход локально — фишка едет сразу, без ожидания
        //    сервера. Тот же детерминированный движок, что и на сервере, поэтому
        //    итог совпадёт, и сверка ниже не даст повторной анимации.
        const prev = game; // снимок ДО хода — для отката при отказе сервера
        const next = E.cloneState(state);
        E.applyMove(next, mv.from, mv.to, mv.die);
        // Кубики исчерпаны — ход завершается (как и делает сервер).
        if (!E.isGameOver(next) && allowedMoves(next).length === 0) E.endTurn(next);
        const turnPassed = next.turn !== state.turn;
        const optimistic: GameRow = {
          ...game,
          state: next,
          turn: next.turn,
          dice: next.dice,
          rolled: next.rolled,
          ply: game.ply + (turnPassed ? 1 : 0),
        };
        gameRef.current = optimistic;
        setGame(optimistic);
        setSelected(null);
        setBusy(true); setError(null);

        // 2) В ФОНЕ отправляем ход серверу (авторитет). Успех — сверяемся и
        //    рассылаем сопернику; отказ — плавно откатываем фишку на место.
        playMove(game.id, mv)
          .then((r) => {
            if (!mounted.current) return;
            applyIncoming(r.game);   // обычно = уже показанному → без повторной анимации
            sync.send(r.game);       // мгновенно показать ход сопернику
          })
          .catch((e) => {
            if (!mounted.current) return;
            gameRef.current = prev;
            setGame(prev);           // откат: фишка плавно вернётся на исходную точку
            setError(e instanceof Error ? e.message : 'Ошибка хода');
          })
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
  }, [game, phase, busy, state, selected, applyIncoming, sync]);

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
