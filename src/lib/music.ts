/* =============================================================================
 * music.ts — Фоновая музыка ТОЛЬКО во время партии. Два трека проигрываются по
 * кругу: music_1.mp3 → music_2.mp3 → music_1.mp3 → …
 * Проигрывание = (мы на игровом экране) И (тумблер «Фоновая музыка» включён).
 * Единый Audio-элемент; ошибки автоплея молча гасим (звук не критичен). Модуль
 * подписан на стор настроек, поэтому реагирует на тумблер сразу.
 * ========================================================================== */
import { isBgMusicEnabled, subscribeSettings } from './gameSettings';

const TRACKS = ['/sound/music_1.mp3', '/sound/music_2.mp3'];

let audio: HTMLAudioElement | null = null;
let trackIdx = 0;
let inGame = false; // находится ли пользователь на игровом экране

function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (audio) return audio;
  audio = new Audio(TRACKS[trackIdx]);
  audio.preload = 'auto';
  audio.volume = 0.45;
  // По окончании трека — следующий по кругу.
  audio.addEventListener('ended', () => {
    if (!audio) return;
    trackIdx = (trackIdx + 1) % TRACKS.length;
    audio.src = TRACKS[trackIdx];
    if (shouldPlay()) void audio.play().catch(() => { /* автоплей заблокирован */ });
  });
  return audio;
}

function shouldPlay(): boolean {
  return inGame && isBgMusicEnabled();
}

/** Пересобрать состояние воспроизведения по текущим флагам. */
function sync(): void {
  if (shouldPlay()) {
    const a = ensureAudio();
    if (a) void a.play().catch(() => { /* до первого жеста автоплей может блокироваться */ });
  } else if (audio) {
    audio.pause();
  }
}

/** Вызывается игровым экраном: true при входе в партию, false при выходе. */
export function setInGame(v: boolean): void {
  if (inGame === v) return;
  inGame = v;
  sync();
}

/** Явная пауза (например, при завершении партии, чтобы не мешать звуку победы). */
export function pauseMusic(): void {
  if (audio) audio.pause();
}

// Реакция на переключение тумблера «Фоновая музыка».
subscribeSettings(sync);
