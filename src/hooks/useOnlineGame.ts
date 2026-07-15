/* =============================================================================
 * useOnlineGame.ts — Онлайн-партия: состояние из БД, ходы через Edge Functions,
 * обновления соперника через Realtime. Совместим с пропсами <Board>.
 * ========================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Color, GameState } from '../engine/types';
import type { GameRow } from '../lib/online.types';
import { getActiveGame, playMove, passTurn, rollDice, subscribeTable, createGameSync } from '../lib/online';
import { targetsFrom, legalSources, allowedMoves, chainedTargetsFrom } from '../game/rules';
import * as E from '../engine/core';

export type Spot = number | 'bar' | 'off';
export type OnlinePhase = 'loading' | 'opening' | 'myRoll' | 'myMove' | 'opponent' | 'gameover';

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
  /** Жеребьёвка «кто первый»: кости на сторонах доски (слева соперник, справа я). */
  opening: { left: number; right: number; result: string | null; rollId: number } | null;
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

  // Жеребьёвка «кто ходит первым»: показываем, пока партия только началась
  // (ply 0, ещё не бросали) и в строке есть opening. Через ~2.8с локально
  // гасим оверлей, чтобы у первого игрока появилась кнопка «Бросить кубики».
  const [openingClearedFor, setOpeningClearedFor] = useState<string | null>(null);
  const showOpeningRaw = Boolean(game && game.opening && game.ply === 0 && !state?.rolled && game.status === 'playing');
  const showOpening = showOpeningRaw && openingClearedFor !== (game?.id ?? null);
  useEffect(() => {
    if (!showOpeningRaw || !game) return;
    const gid = game.id;
    const t = window.setTimeout(() => { if (mounted.current) setOpeningClearedFor(gid); }, 3500);
    return () => window.clearTimeout(t);
  }, [showOpeningRaw, game?.id]);

  const phase: OnlinePhase = useMemo(() => {
    if (!game) return 'loading';
    if (game.status === 'finished') return 'gameover';
    if (showOpening) return 'opening';
    if (!myColor) return 'opponent';
    if (game.turn !== myColor) return 'opponent';
    return state?.rolled ? 'myMove' : 'myRoll';
  }, [game, myColor, state, showOpening]);

  const opening = useMemo(() => {
    if (!showOpening || !game?.opening) return null;
    const o = game.opening;
    const myDie = myColor ? o[myColor] : o.w;
    const oppDie = myColor ? o[myColor === 'w' ? 'b' : 'w'] : o.b;
    const result = myColor
      ? (game.turn === myColor ? 'Вы ходите первым' : 'Первым ходит соперник')
      : (game.turn === 'w' ? 'Первым ходят белые' : 'Первым ходят чёрные');
    return { left: oppDie, right: myDie, result, rollId: 0 };
  }, [showOpening, game, myColor]);

  const sources = useMemo(
    () => (myTurn && state?.rolled ? legalSources(state) : new Set<number | 'bar'>()),
    [myTurn, state],
  );
  const targets = useMemo(() => {
    if (!(myTurn && state?.rolled && selected !== null)) return [];
    const from = selected as number | 'bar';
    const single = targetsFrom(state, from);
    // Конечные точки цепочки (оба кубика одной шашкой) — дополнительные цели.
    const chainMoves = chainedTargetsFrom(state, from)
      .map((c) => ({ from, to: c.to, die: c.seq[c.seq.length - 1].die }));
    return [...single, ...chainMoves];
  }, [myTurn, state, selected]);

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
      // Цепочка: клик по КОНЕЧНОЙ точке — оптимистично применяем всю
      // последовательность одной шашкой, а на сервер отправляем полуходы по
      // очереди (play-move идемпотентна по updated_at). Отказ — откат к prev.
      const chain = chainedTargetsFrom(state, from).find((c) => c.to === spot);
      if (chain) {
        const prev = game;
        const next = E.cloneState(state);
        for (const mv of chain.seq) E.applyMove(next, mv.from, mv.to, mv.die);
        if (!E.isGameOver(next) && allowedMoves(next).length === 0) E.endTurn(next);
        const turnPassed = next.turn !== state.turn;
        const optimistic: GameRow = {
          ...game, state: next, turn: next.turn, dice: next.dice, rolled: next.rolled,
          ply: game.ply + (turnPassed ? 1 : 0),
        };
        gameRef.current = optimistic;
        setGame(optimistic);
        setSelected(null);
        setBusy(true); setError(null);
        (async () => {
          try {
            let last: GameRow | null = null;
            for (const mv of chain.seq) { const r = await playMove(game.id, mv); last = r.game; }
            if (!mounted.current) return;
            if (last) { applyIncoming(last); sync.send(last); }
          } catch (e) {
            if (!mounted.current) return;
            gameRef.current = prev;
            setGame(prev);
            setError(e instanceof Error ? e.message : 'Ошибка хода');
          } finally {
            if (mounted.current) setBusy(false);
          }
        })();
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

  // Авто-пас в онлайне: если после броска у ходящего НЕТ ходов, кости уже
  // показаны обоим игрокам (сервер roll-dice больше не пасует сам). Даём ~2.4с
  // разглядеть, что выпало, и только затем просим сервер пропустить ход
  // (pass-turn). Так анимация броска видна ВСЕГДА, даже когда сходить нечем.
  useEffect(() => {
    if (phase !== 'myMove' || !game || !state || busy) return;
    if (sources.size > 0) return; // есть ходы — не пасуем
    const gid = game.id;
    const t = window.setTimeout(() => {
      if (!mounted.current) return;
      passTurn(gid).then((r) => {
        if (!mounted.current) return;
        applyIncoming(r.game);
        sync.send(r.game);
      }).catch(() => { /* сервер отклонит, если ход уже сменился */ });
    }, 2400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, game?.id, game?.ply, state?.rolled, sources, busy]);

  const message = useMemo(() => {
    if (error) return error;
    switch (phase) {
      case 'loading': return 'Загрузка партии…';
      case 'opening': return '';
      case 'myRoll': return 'Ваш ход — бросьте кубики';
      case 'myMove': return busy ? 'Ход…' : (sources.size === 0 ? 'Ходов нет — ход перейдёт сопернику' : 'Выберите шашку и ход');
      case 'opponent': return myColor ? 'Ход соперника…' : 'Идёт партия';
      case 'gameover': return game?.winner === myColor ? 'Вы победили!' : 'Партия завершена';
      default: return '';
    }
  }, [phase, busy, error, myColor, game, sources]);

  useEffect(() => { setSelected(null); }, [game?.ply, game?.turn]);

  return {
    game, state, phase, myColor, selected, sources, targets, message, busy, error, rollId,
    opening,
    roll, pick,
  };
}
