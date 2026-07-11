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
