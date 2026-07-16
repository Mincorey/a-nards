/* =============================================================================
 * useGame.ts — Игровой цикл «человек против бота» (короткие/длинные нарды).
 * Управляет фазами: вступительный бросок (кто ходит первым) → бросок человека
 * → ходы → бот → победа.
 * Поддерживает ПАУЗУ (pausedRef): пока pausedRef.current === true, асинхронные
 * шаги бота/вступительного броска замирают и продолжаются после снятия паузы.
 * Поддерживает ВОССТАНОВЛЕНИЕ (initial): если передан снимок партии — стартуем
 * с него, не запуская новую партию (используется для сохранения между
 * перезагрузками/поворотом экрана, см. BotGameSession.tsx).
 * ========================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Color, GameState, Move, Variant } from '../engine/types';
import * as E from '../engine/core';
import { allowedMoves, targetsFrom, legalSources, chainedTargetsFrom } from './rules';
import { chooseSequence, type Difficulty } from './bot';

export type Spot = number | 'bar' | 'off';
export type Phase = 'openingRoll' | 'humanRoll' | 'humanMove' | 'botTurn' | 'gameover';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OpeningDice { human: number; bot: number; }

/** Снимок партии для сохранения/восстановления (JSON-сериализуемый). */
export interface GameSnapshot {
  game: GameState;
  phase: Phase;
  message: string;
  winner: Color | null;
  rollId: number;
}

export interface UseGame {
  game: GameState;
  phase: Phase;
  selected: Spot | null;
  targets: Move[];
  sources: Set<number | 'bar'>;
  message: string;
  winner: Color | null;
  humanColor: Color;
  rollId: number;
  /** Пока не null — идёт вступительный бросок «кто ходит первым» (по одной кости на игрока). */
  openingDice: OpeningDice | null;
  roll: () => void;
  pick: (spot: Spot) => void;
  reset: () => void;
}

export function useGame(
  humanColor: Color = 'w',
  difficulty: Difficulty = 'medium',
  variant: Variant = 'short',
  pausedRef?: { current: boolean },
  initial?: GameSnapshot | null,
): UseGame {
  const gameRef = useRef<GameState>(initial ? E.cloneState(initial.game) : E.initState(variant));
  const [snap, setSnap] = useState<GameState>(() => E.cloneState(gameRef.current));
  const [phase, setPhase] = useState<Phase>(initial ? initial.phase : 'openingRoll');
  const [selected, setSelected] = useState<Spot | null>(null);
  const [message, setMessage] = useState(initial ? initial.message : 'Определяем, кто ходит первым…');
  const [winner, setWinner] = useState<Color | null>(initial ? initial.winner : null);
  const [rollId, setRollId] = useState(initial ? initial.rollId : 0);
  const [openingDice, setOpeningDice] = useState<OpeningDice | null>(null);
  // Растёт при каждом reset() — нужен, чтобы ПЕРЕЗАПУСТИТЬ вступительный бросок,
  // даже если phase и так уже был 'openingRoll'.
  const [resetTick, setResetTick] = useState(0);
  const mounted = useRef(true);
  // Если стартовали с восстановленного снимка — ПЕРВЫЙ прогон эффекта смены
  // варианта (который иначе вызвал бы reset() и стёр восстановленную партию)
  // нужно пропустить.
  const skipInitialReset = useRef(!!initial);

  const render = useCallback(() => setSnap(E.cloneState(gameRef.current)), []);

  // Асинхронный «шлюз»: держит корутину, пока стоит пауза.
  const waitResume = useCallback(async () => {
    while (pausedRef?.current && mounted.current) await sleep(120);
  }, [pausedRef]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const checkWin = useCallback((): boolean => {
    if (E.isGameOver(gameRef.current)) {
      const w = E.winner(gameRef.current);
      setWinner(w);
      setPhase('gameover');
      setMessage(w === humanColor ? 'Вы победили!' : 'Победил бот');
      return true;
    }
    return false;
  }, [humanColor]);

  const endHuman = useCallback(() => {
    // Страховка: если партия уже завершена (последняя шашка вынесена) — НИКОГДА
    // не передаём ход боту. Иначе «протухший» таймер конца хода мог бы перебить
    // фазу gameover на botTurn и скрыть модалку победы. Фиксируем победу.
    if (E.isGameOver(gameRef.current)) { checkWin(); return; }
    E.endTurn(gameRef.current);
    setSelected(null);
    render();
    setPhase('botTurn');
  }, [render, checkWin]);

  const roll = useCallback(() => {
    // Бросаем только в свою фазу и ТОЛЬКО если кости ещё не брошены. Второй
    // guard (rolled) критичен: при пасе с бара фаза остаётся 'humanRoll' ещё
    // ~2.4с (пока сработает авто-пас), и раньше повторный клик по кнопке
    // перекидывал кости и плодил дублирующие таймеры endHuman — из-за чего ход
    // мог «улететь» на лишнюю передачу и стороны менялись местами.
    if (phase !== 'humanRoll' || gameRef.current.rolled) return;
    E.startTurn(gameRef.current);
    setRollId((n) => n + 1);
    render();
    if (allowedMoves(gameRef.current).length === 0) {
      setMessage('Нет доступных ходов — пас');
      // Замедлено (было 900 мс): при пасе — особенно когда шашка на баре и
      // бросок не даёт входа — игрок должен успеть разглядеть, что выпало на
      // костях, прежде чем кубики исчезнут вместе с передачей хода.
      setTimeout(() => { if (mounted.current) endHuman(); }, 2400);
    } else {
      setPhase('humanMove');
      setMessage('Выберите шашку и ход');
    }
  }, [phase, render, endHuman]);

  const pick = useCallback((spot: Spot) => {
    if (phase !== 'humanMove') return;
    const s = gameRef.current;
    const srcs = legalSources(s);

    if (selected !== null) {
      const from = selected as number | 'bar';
      const move = targetsFrom(s, from).find((m) => m.to === spot);
      if (move) {
        E.applyMove(s, move.from, move.to, move.die);
        setSelected(null);
        render();
        if (checkWin()) return;
        if (allowedMoves(s).length === 0) {
          setMessage('Ход завершён');
          setTimeout(() => { if (mounted.current) endHuman(); }, 500);
        } else {
          setMessage('Продолжайте ход');
        }
        return;
      }
      // Цепочка: клик по КОНЕЧНОЙ точке — играем всю последовательность одной шашкой.
      const chain = chainedTargetsFrom(s, from).find((c) => c.to === spot);
      if (chain) {
        for (const mv of chain.seq) E.applyMove(s, mv.from, mv.to, mv.die);
        setSelected(null);
        render();
        if (checkWin()) return;
        if (allowedMoves(s).length === 0) {
          setMessage('Ход завершён');
          setTimeout(() => { if (mounted.current) endHuman(); }, 500);
        } else {
          setMessage('Продолжайте ход');
        }
        return;
      }
      if (spot === selected) { setSelected(null); return; }
    }
    if ((spot === 'bar' || typeof spot === 'number') && srcs.has(spot as number | 'bar')) {
      setSelected(spot as Spot);
      return;
    }
    setSelected(null);
  }, [phase, selected, render, checkWin, endHuman]);

  // Вступительный бросок: каждый бросает по одной кости, у кого больше — тот
  // и начинает партию первым (при равенстве — перебрасываем).
  useEffect(() => {
    if (phase !== 'openingRoll') return;
    let cancelled = false;
    setOpeningDice(null);
    setMessage('Определяем, кто ходит первым…');
    (async () => {
      await waitResume();
      await sleep(500);
      if (cancelled || !mounted.current) return;
      let h = 0, b = 0;
      do {
        h = 1 + Math.floor(Math.random() * 6);
        b = 1 + Math.floor(Math.random() * 6);
      } while (h === b);
      if (cancelled || !mounted.current) return;
      setOpeningDice({ human: h, bot: b });
      const humanStarts = h > b;
      setMessage(humanStarts ? 'Вы начинаете первым!' : 'Первым ходит соперник');
      await waitResume();
      // Показываем результат стартового броска дольше (было 1700 мс) — чтобы
      // игрок успел разглядеть, какие кости выпали и кто ходит первым.
      await sleep(4000);
      if (cancelled || !mounted.current) return;
      gameRef.current.turn = humanStarts ? humanColor : E.opp(humanColor);
      setOpeningDice(null);
      setPhase(humanStarts ? 'humanRoll' : 'botTurn');
      setMessage(humanStarts ? 'Ваш ход — бросьте кубики' : 'Соперник бросает кубики…');
    })();
    return () => { cancelled = true; };
  }, [phase, humanColor, resetTick, waitResume]);

  // Ход бота.
  useEffect(() => {
    if (phase !== 'botTurn') return;
    let cancelled = false;
    (async () => {
      await waitResume();
      if (cancelled || !mounted.current) return;
      // Бросаем кубики ТОЛЬКО если ход бота ещё не начат. При восстановлении
      // партии из снимка в фазе хода бота кубики уже брошены (rolled != null) —
      // НЕ перебрасываем, иначе получалась лёгкая недетерминированность
      // (бот «перекидывал» уже показанные кубики), аудит L4.
      if (!gameRef.current.rolled) {
        setMessage('Соперник бросает кубики…');
        await sleep(700);
        if (cancelled || !mounted.current) return;
        await waitResume();
        E.startTurn(gameRef.current);
        setRollId((n) => n + 1);
        render();
        // Пауза ~1с после броска — дать увидеть выпавшие кубики перед ходами.
        await sleep(1100);
        if (cancelled || !mounted.current) return;
      }

      const seq = chooseSequence(gameRef.current, difficulty);
      if (seq.length === 0) {
        setMessage('У соперника нет ходов — пас');
        await sleep(1000);
      } else {
        setMessage('Ход соперника…');
      }
      for (const m of seq) {
        await waitResume();
        if (cancelled || !mounted.current) return;
        E.applyMove(gameRef.current, m.from, m.to, m.die);
        render();
        if (E.isGameOver(gameRef.current)) break;
        await sleep(1900);
      }
      if (cancelled || !mounted.current) return;
      if (checkWin()) return;
      E.endTurn(gameRef.current);
      render();
      setPhase('humanRoll');
      setMessage('Ваш ход — бросьте кубики');
    })();
    return () => { cancelled = true; };
  }, [phase, difficulty, render, checkWin, waitResume]);

  const reset = useCallback(() => {
    gameRef.current = E.initState(variant);
    setSelected(null);
    setWinner(null);
    setOpeningDice(null);
    render();
    setPhase('openingRoll');
    setResetTick((t) => t + 1);
    setMessage('Определяем, кто ходит первым…');
  }, [render, variant]);

  // Смена варианта — начинаем новую партию. Первый прогон пропускаем, если
  // партия была восстановлена из снимка (иначе reset() стёр бы её).
  useEffect(() => {
    if (skipInitialReset.current) { skipInitialReset.current = false; return; }
    reset();
  }, [variant, reset]);

  const targets = useMemo(() => {
    if (!(selected !== null && phase === 'humanMove')) return [];
    const from = selected as number | 'bar';
    const single = targetsFrom(snap, from);
    // Конечные точки цепочки (оба кубика одной шашкой) — как дополнительные цели.
    const chainMoves: Move[] = chainedTargetsFrom(snap, from)
      .map((c) => ({ from, to: c.to, die: c.seq[c.seq.length - 1].die }));
    return [...single, ...chainMoves];
  }, [selected, phase, snap]);
  const sources = useMemo(
    () => (phase === 'humanMove' ? legalSources(snap) : new Set<number | 'bar'>()),
    [phase, snap],
  );

  return {
    game: snap, phase, selected, targets, sources, message, winner, humanColor,
    rollId, openingDice,
    roll, pick, reset,
  };
}
