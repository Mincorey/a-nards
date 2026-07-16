// Звуковые эффекты игры. Держим по одному переиспользуемому Audio-элементу на
// эффект, чтобы не создавать новый объект на каждый бросок. Все ошибки/блокировки
// автоплея молча гасим — звук не критичен для игры.

import { isDiceSoundEnabled } from './gameSettings';

let diceAudio: HTMLAudioElement | null = null;

/**
 * Проигрывает звук броска игральных костей (public/sound/throw_of_dice.mp3).
 * Вызывается в момент броска в любой партии — с ботом и в онлайне.
 * currentTime сбрасываем в 0, чтобы повторный бросок звучал заново, даже если
 * предыдущий ещё не доиграл.
 */
export function playDiceRoll(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  if (!isDiceSoundEnabled()) return;
  try {
    if (!diceAudio) {
      diceAudio = new Audio('/sound/throw_of_dice.mp3');
      diceAudio.preload = 'auto';
    }
    diceAudio.currentTime = 0;
    void diceAudio.play().catch(() => { /* автоплей до первого жеста / нет звука */ });
  } catch {
    /* воспроизведение звука не критично */
  }
}

let victoryAudio: HTMLAudioElement | null = null;

/**
 * Проигрывает звук победы (public/sound/victory.mp3) — один раз при выигрыше
 * пользователя (показ модалки победы). Не привязан к тумблеру звука костей.
 */
export function playVictory(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  try {
    if (!victoryAudio) {
      victoryAudio = new Audio('/sound/victory.mp3');
      victoryAudio.preload = 'auto';
    }
    victoryAudio.currentTime = 0;
    void victoryAudio.play().catch(() => { /* автоплей до первого жеста / нет звука */ });
  } catch {
    /* воспроизведение звука не критично */
  }
}

let checkerAudio: HTMLAudioElement | null = null;

/**
 * Проигрывает звук постановки шашки на доску (public/sound/checker.mp3) — короткий
 * «стук» фишки о доску. Вызывается в момент ПРИЗЕМЛЕНИЯ шашки в любой партии
 * (с ботом и в онлайне), для ходов игрока, соперника и бота одинаково.
 * Гейтится тем же тумблером игровых звуков, что и кости.
 */
export function playChecker(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  if (!isDiceSoundEnabled()) return;
  try {
    if (!checkerAudio) {
      checkerAudio = new Audio('/sound/checker.mp3');
      checkerAudio.preload = 'auto';
    }
    checkerAudio.currentTime = 0;
    void checkerAudio.play().catch(() => { /* автоплей до первого жеста / нет звука */ });
  } catch {
    /* воспроизведение звука не критично */
  }
}
