/* =============================================================================
 * gameSettings.ts — Пользовательские настройки игры (звук + фоновая музыка).
 * Простой внешний стор с подпиской + хук на useSyncExternalStore, значения
 * сохраняются в localStorage, чтобы выбор запоминался между сессиями.
 * ========================================================================== */
import { useSyncExternalStore } from 'react';

const KEY_DICE_SOUND = 'anards.sound.diceRoll';
const KEY_BG_MUSIC = 'anards.sound.bgMusic';
const KEY_SFX_VOL = 'anards.sound.sfxVolume';   // уровень игровых звуков (кости/шашки/победа)
const KEY_MUSIC_VOL = 'anards.sound.musicVolume'; // уровень фоновой музыки

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

/** Читает число 0..1 из localStorage; при ошибке/мусоре — значение по умолчанию. */
function loadVol(key: string, def: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return def;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : def;
  } catch {
    return def;
  }
}
function saveVol(key: string, v: number): void {
  try { localStorage.setItem(key, String(v)); } catch { /* приватный режим и т.п. */ }
}

let diceSoundEnabled = loadBool(KEY_DICE_SOUND, true);
let bgMusicEnabled = loadBool(KEY_BG_MUSIC, false); // по умолчанию выключена
let sfxVolume = loadVol(KEY_SFX_VOL, 0.7);          // громкость игровых звуков 0..1
let musicVolume = loadVol(KEY_MUSIC_VOL, 0.45);     // громкость фоновой музыки 0..1
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

/** Громкость игровых звуков (кости/шашки/победа), 0..1 — для sound.ts без React. */
export function getSfxVolume(): number { return sfxVolume; }

export function setSfxVolume(v: number): void {
  const nv = Math.min(1, Math.max(0, v));
  if (sfxVolume === nv) return;
  sfxVolume = nv;
  saveVol(KEY_SFX_VOL, nv);
  emit();
}

/** Громкость фоновой музыки, 0..1 — для music.ts без React. */
export function getMusicVolume(): number { return musicVolume; }

export function setMusicVolume(v: number): void {
  const nv = Math.min(1, Math.max(0, v));
  if (musicVolume === nv) return;
  musicVolume = nv;
  saveVol(KEY_MUSIC_VOL, nv);
  emit();
}

/** Реактивные хуки для компонентов настроек. */
export function useDiceSoundEnabled(): boolean {
  return useSyncExternalStore(subscribeSettings, isDiceSoundEnabled, isDiceSoundEnabled);
}
export function useBgMusicEnabled(): boolean {
  return useSyncExternalStore(subscribeSettings, isBgMusicEnabled, isBgMusicEnabled);
}
export function useSfxVolume(): number {
  return useSyncExternalStore(subscribeSettings, getSfxVolume, getSfxVolume);
}
export function useMusicVolume(): number {
  return useSyncExternalStore(subscribeSettings, getMusicVolume, getMusicVolume);
}
