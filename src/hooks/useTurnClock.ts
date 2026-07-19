/* =============================================================================
 * useTurnClock.ts — Часы текущего хода онлайн-партии (тикают каждые 500 мс).
 * -----------------------------------------------------------------------------
 * Основное время (90с) отображает кольцо на аватаре; этот хук отвечает за
 * ДОПОЛНИТЕЛЬНОЕ время (30с) после истечения основного:
 *   • отдаёт inExtra/extraLeftMs для бейджа обратного отсчёта над доской;
 *   • в момент старта доп. времени играет timer_bell.mp3;
 *   • когда доп. времени остаётся ≤10с — запускает countdown_10s.mp3;
 *   • при смене хода/завершении партии тиканье останавливается.
 * Звуки слышат ОБА игрока (и тот, чьё время тает, и ожидающий соперник).
 * Точка отсчёта — game.updated_at (момент последнего действия), как на сервере
 * claim-timeout, поэтому клиентские часы согласованы с присуждением поражения.
 * ========================================================================== */
import { useEffect, useRef, useState } from 'react';
import type { GameRow } from '../lib/online.types';
import { turnClock, COUNTDOWN_AT_MS, type TurnClock } from '../game/timeout';
import { playTimerBell, playCountdown10, stopCountdown10 } from '../lib/sound';

export function useTurnClock(game: GameRow | null): TurnClock | null {
  const active = Boolean(game && game.status === 'playing');
  const updatedAt = active ? game!.updated_at : null;
  const [clock, setClock] = useState<TurnClock | null>(null);

  // Тик часов. Ключ отсчёта — updated_at: любое действие (бросок/полуход/пас)
  // сбрасывает таймер, как и на сервере.
  useEffect(() => {
    if (!updatedAt) { setClock(null); return; }
    const tick = () => setClock(turnClock(updatedAt));
    tick();
    const iv = window.setInterval(tick, 500);
    return () => window.clearInterval(iv);
  }, [updatedAt]);

  // Звуки. «Взведение» — по ключу отсчёта, чтобы каждый звук играл РОВНО один
  // раз за конкретный отсчёт и снова мог сыграть после сброса таймера.
  const bellPlayedFor = useRef<string | null>(null);
  const countdownPlayedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!updatedAt || !clock) { stopCountdown10(); return; }
    if (clock.inExtra && bellPlayedFor.current !== updatedAt) {
      bellPlayedFor.current = updatedAt;
      playTimerBell();
    }
    if (clock.inExtra && clock.extraLeftMs <= COUNTDOWN_AT_MS && countdownPlayedFor.current !== updatedAt) {
      countdownPlayedFor.current = updatedAt;
      playCountdown10();
    }
    // Ход сделан (updated_at сменится) или лимит вышел — тиканье глушим.
    if (clock.expired) stopCountdown10();
  }, [clock, updatedAt]);

  // Смена отсчёта/размонтирование — остановить тиканье последних секунд.
  useEffect(() => () => stopCountdown10(), [updatedAt]);

  return active ? clock : null;
}
