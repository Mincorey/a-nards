// Звуковые эффекты игры. Держим по одному переиспользуемому Audio-элементу на
// эффект, чтобы не создавать новый объект на каждый бросок. Все ошибки/блокировки
// автоплея молча гасим — звук не критичен для игры.

import { isDiceSoundEnabled, getSfxVolume } from './gameSettings';

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
    diceAudio.volume = getSfxVolume();
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
    victoryAudio.volume = getSfxVolume();
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
    checkerAudio.volume = getSfxVolume();
    checkerAudio.currentTime = 0;
    void checkerAudio.play().catch(() => { /* автоплей до первого жеста / нет звука */ });
  } catch {
    /* воспроизведение звука не критично */
  }
}

let bellAudio: HTMLAudioElement | null = null;

/**
 * Звонок начала ДОПОЛНИТЕЛЬНОГО времени хода (public/sound/timer_bell.mp3):
 * основное время (90с) истекло, пошёл добавочный 30-секундный отсчёт.
 * Гейтится тем же тумблером игровых звуков и общей громкостью эффектов.
 */
export function playTimerBell(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  if (!isDiceSoundEnabled()) return;
  try {
    if (!bellAudio) {
      bellAudio = new Audio('/sound/timer_bell.mp3');
      bellAudio.preload = 'auto';
    }
    bellAudio.volume = getSfxVolume();
    bellAudio.currentTime = 0;
    void bellAudio.play().catch(() => { /* автоплей до первого жеста / нет звука */ });
  } catch {
    /* воспроизведение звука не критично */
  }
}

let countdownAudio: HTMLAudioElement | null = null;

/**
 * Тиканье ПОСЛЕДНИХ 10 секунд дополнительного времени
 * (public/sound/countdown_10s.mp3). Запускается один раз, когда доп. времени
 * остаётся ≤10с; обязательно останавливать через stopCountdown10(), если игрок
 * успел сходить или партия закончилась.
 */
export function playCountdown10(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  if (!isDiceSoundEnabled()) return;
  try {
    if (!countdownAudio) {
      countdownAudio = new Audio('/sound/countdown_10s.mp3');
      countdownAudio.preload = 'auto';
    }
    countdownAudio.volume = getSfxVolume();
    countdownAudio.currentTime = 0;
    void countdownAudio.play().catch(() => { /* автоплей до первого жеста / нет звука */ });
  } catch {
    /* воспроизведение звука не критично */
  }
}

/** Останавливает тиканье последних секунд (ход сделан / партия закончилась). */
export function stopCountdown10(): void {
  try {
    if (countdownAudio) { countdownAudio.pause(); countdownAudio.currentTime = 0; }
  } catch {
    /* не критично */
  }
}
