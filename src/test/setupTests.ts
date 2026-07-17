/* Глобальный setup для vitest (подключён через test.setupFiles в vite.config.ts).
 *
 * Гасит шумное предупреждение jsdom «Not implemented: HTMLMediaElement's play()
 * method»: в тестовой среде нет аудио-стека, а наш звук (lib/sound, lib/music)
 * дергает audio.play()/pause(). Код везде вызывает .play().catch(...), поэтому
 * достаточно вернуть resolved-промис. Мок применяется только в jsdom-окружении;
 * в node-тестах (движок/правила) HTMLMediaElement отсутствует — тогда пропускаем. */
import { vi } from 'vitest';

if (typeof HTMLMediaElement !== 'undefined') {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
}
