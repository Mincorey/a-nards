/* =============================================================================
 * gameSettings.ts — Пользовательские настройки игры (звук + фоновая музыка).
 * Простой внешний стор с подпиской + хук на useSyncExternalStore, значения
 * сохраняются в localStorage, чтобы выбор запоминался между сессиями.
 * ========================================================================== */
import { useSyncExternalStore } from 'react';

const KEY_DICE_SOUND = 'anards.sound.diceRoll';
const KEY_BG_MUSIC = 'anards.sound.bgMusic';

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
let bgMusicEnabled = loadBool(KEY_BG_MUSIC, false); // по умолчанию выключена
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

/** Включена ли фоновая музыка (для music.ts — без React). */
export function isBgMusicEnabled(): boolean { return bgMusicEnabled; }

export function setBgMusicEnabled(v: boolean): void {
  if (bgMusicEnabled === v) return;
  bgMusicEnabled = v;
  saveBool(KEY_BG_MUSIC, v);
  emit();
}

/** Реактивные хуки для компонентов настроек. */
export function useDiceSoundEnabled(): boolean {
  return useSyncExternalStore(subscribeSettings, isDiceSoundEnabled, isDiceSoundEnabled);
}
export function useBgMusicEnabled(): boolean {
  return useSyncExternalStore(subscribeSettings, isBgMusicEnabled, isBgMusicEnabled);
}
