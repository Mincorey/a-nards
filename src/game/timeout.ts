/* =============================================================================
 * timeout.ts — Чистая логика таймаута хода (без сети), чтобы её можно было
 * юнит-тестировать. Лимит согласован с edge-функцией claim-timeout.
 * ========================================================================== */
import type { GameRow } from '../lib/online.types';

/** Лимит времени на ход, мс (совпадает с сервером claim-timeout). */
export const TURN_LIMIT_MS = 90_000;

/**
 * Пора ли ПРИСУТСТВУЮЩЕМУ игроку (myColor) засчитывать сопернику таймаут хода?
 * true только если: партия идёт, сейчас ход СОПЕРНИКА, и с начала его хода
 * (game.updated_at) прошло больше лимита + грейс на рассинхрон часов. Сервер
 * перепроверит срок сам — это лишь клиентский триггер.
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
