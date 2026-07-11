/* =============================================================================
 * gameSettings.ts — Пользовательские настройки игры (пока только звук).
 * Простой внешний стор с подпиской + хук на useSyncExternalStore, значение
 * сохраняется в localStorage, чтобы выбор запоминался между сессиями.
 * ========================================================================== */
import { useSyncExternalStore } from 'react';

const KEY_DICE_SOUND = 'anards.sound.diceRoll';

function loadBool(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === '1';
  } catch {
    return def;
  }
}
function saveBool(key: string, v: boolean): void {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* приватный режим и т.п. */ }
}

let diceSoundEnabled = loadBool(KEY_DICE_SOUND, true);
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

export function subscribeSettings(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Включён ли звук броска костей (для sound.ts — без React). */
export function isDiceSoundEnabled(): boolean { return diceSoundEnabled; }

export function setDiceSoundEnabled(v: boolean): void {
  if (diceSoundEnabled === v) return;
  diceSoundEnabled = v;
  saveBool(KEY_DICE_SOUND, v);
  emit();
}

/** Реактивный хук для компонентов настроек. */
export function useDiceSoundEnabled(): boolean {
  return useSyncExternalStore(subscribeSettings, isDiceSoundEnabled, isDiceSoundEnabled);
}
