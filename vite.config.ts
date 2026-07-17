/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/* -----------------------------------------------------------------------------
 * ID сборки: уникальная метка текущего билда. Зашивается в клиент как
 * __BUILD_ID__ (define ниже) И одновременно кладётся в статический файл
 * dist/version.json. Клиент периодически сравнивает своё зашитое значение с
 * содержимым version.json (см. src/lib/useVersionCheck.ts) — если отличается,
 * значит вышел новый деплой, и можно предложить пользователю обновиться.
 * version.json раздаётся с CDN Vercel как обычная статика — ноль запросов к БД
 * / Supabase, вес ~50 байт.
 * -------------------------------------------------------------------------- */
const BUILD_ID = new Date().toISOString();

/** Плагин: во время сборки эмитит dist/version.json с текущим BUILD_ID. */
function emitVersionJson(): Plugin {
  return {
    name: 'emit-version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: BUILD_ID }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), emitVersionJson()],
  define: {
    // Значение зашивается в бандл на этапе сборки. В dev-режиме это тоже строка
    // ISO-времени запуска dev-сервера — там version.json отсутствует, и хук
    // проверки версии просто молча игнорирует неудачный запрос.
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: { host: true, port: 5173 },
  build: { outDir: 'dist', sourcemap: true },
  // Vitest: глобальный setup гасит шум jsdom (HTMLMediaElement.play). Окружение
  // (jsdom/node) по-прежнему выбирается в каждом тесте через // @vitest-environment.
  test: {
    setupFiles: ['./src/test/setupTests.ts'],
  },
});
