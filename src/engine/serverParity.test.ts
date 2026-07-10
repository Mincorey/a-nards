/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — тест использует node:fs; @types/node в проекте не подключён,
// поэтому отключаем проверку типов для файла (vitest/esbuild выполнит как есть).
/* Паритет движка клиент↔сервер (аудит M1): файлы supabase/functions/_shared/*
 * должны быть ровно тем, что генерирует scripts/sync-server-engine.mjs из
 * канонических src/engine/* и src/game/rules.ts. Если тест упал — движок
 * правили, но серверные копии не пересобрали: запустите `npm run sync:engine`. */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { buildFiles } from '../../scripts/sync-server-engine.mjs';

const OUT = 'supabase/functions/_shared';

describe('паритет движка клиент↔сервер (_shared сгенерирован из src/engine)', () => {
  const files = buildFiles();

  for (const [name, content] of Object.entries(files)) {
    it(`_shared/${name} совпадает с генерацией из src/engine`, () => {
      const path = `${OUT}/${name}`;
      expect(existsSync(path), `${path} отсутствует — запустите npm run sync:engine`).toBe(true);
      expect(readFileSync(path, 'utf8')).toBe(content);
    });
  }

  it('в _shared нет устаревшего engine.ts', () => {
    expect(
      existsSync(`${OUT}/engine.ts`),
      'Удалите supabase/functions/_shared/engine.ts (npm run sync:engine)',
    ).toBe(false);
  });
});
