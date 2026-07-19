/* =============================================================================
 * timeout.ts — Чистая логика таймаута хода (без сети), чтобы её можно было
 * юнит-тестировать. Лимиты согласованы с edge-функцией claim-timeout.
 * -----------------------------------------------------------------------------
 * Время на ход двухступенчатое:
 *   • ОСНОВНОЕ время (MAIN_TIME_MS, 90с) — обычный ход, кольцо на аватаре;
 *   • ДОПОЛНИТЕЛЬНОЕ время (EXTRA_TIME_MS, 30с) — когда основное истекло:
 *     на экране идёт обратный отсчёт, в начале звучит timer_bell.mp3, на
 *     последних 10 секундах — countdown_10s.mp3;
 *   • после истечения ОБОИХ лимитов присутствующий соперник засчитывает
 *     ходящему поражение (claim-timeout, сервер перепроверяет срок сам).
 * ========================================================================== */
import type { GameRow } from '../lib/online.types';

/** Основное время на ход, мс. */
export const MAIN_TIME_MS = 90_000;
/** Дополнительное время после истечения основного, мс. */
export const EXTRA_TIME_MS = 30_000;
/** Порог «последних секунд» доп. времени для звука countdown_10s.mp3, мс. */
export const COUNTDOWN_AT_MS = 10_000;
/** Полный лимит времени на ход, мс (совпадает с сервером claim-timeout). */
export const TURN_LIMIT_MS = MAIN_TIME_MS + EXTRA_TIME_MS;

/** Состояние часов текущего хода в момент now. */
export interface TurnClock {
  /** Идёт ли дополнительное время (основное истекло, полный лимит — ещё нет). */
  inExtra: boolean;
  /** Осталось основного времени, мс (0, если истекло). */
  mainLeftMs: number;
  /** Осталось дополнительного времени, мс (0, если истекло; EXTRA_TIME_MS, пока идёт основное). */
  extraLeftMs: number;
  /** Истёк ли ПОЛНЫЙ лимит (основное + дополнительное). */
  expired: boolean;
}

/**
 * Часы хода: сколько времени осталось, идёт ли доп. время. Точка отсчёта —
 * updated_at строки партии (момент последнего действия), как и на сервере.
 */
export function turnClock(updatedAtIso: string, now: number = Date.now()): TurnClock {
  const elapsed = Math.max(0, now - new Date(updatedAtIso).getTime());
  const mainLeftMs = Math.max(0, MAIN_TIME_MS - elapsed);
  const extraLeftMs = Math.min(EXTRA_TIME_MS, Math.max(0, TURN_LIMIT_MS - elapsed));
  return {
    inExtra: mainLeftMs === 0 && extraLeftMs > 0,
    mainLeftMs,
    extraLeftMs,
    expired: elapsed >= TURN_LIMIT_MS,
  };
}

/**
 * Пора ли ПРИСУТСТВУЮЩЕМУ игроку (myColor) засчитывать сопернику таймаут хода?
 * true только если: партия идёт, сейчас ход СОПЕРНИКА, и с начала его хода
 * (game.updated_at) прошло больше ПОЛНОГО лимита (основное + доп. время) +
 * грейс на рассинхрон часов. Сервер перепроверит срок сам — это лишь
 * клиентский триггер.
 */
export function shouldClaimTimeout(
  game: Pick<GameRow, 'status' | 'turn' | 'updated_at'> | null,
  myColor: 'w' | 'b' | null,
  now: number = Date.now(),
  graceMs = 1500,
): boolean {
  if (!game || game.status !== 'playing' || !myColor) return false;
  if (game.turn === myColor) return false; // мой ход — не я засчитываю
  return now >= new Date(game.updated_at).getTime() + TURN_LIMIT_MS + graceMs;
}
