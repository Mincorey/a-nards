/* Генерирует Deno-копии движка/правил для Edge Functions из КАНОНИЧЕСКИХ
 * исходников клиента (src/engine, src/game/rules.ts) — паритет клиент↔сервер
 * по построению (аудит M1). Файлы _shared: types.ts, short.ts, long.ts,
 * core.ts, rules.ts. util.ts — инфраструктура Edge Functions, НЕ генерируется.
 *
 * Запуск:
 *   node scripts/sync-server-engine.mjs           — перегенерировать _shared
 *   node scripts/sync-server-engine.mjs --check    — только проверить (exit 1 при расхождении)
 *
 * Перед деплоем Edge Functions выполняйте `npm run sync:engine`. Расхождение
 * также ловит тест src/engine/serverParity.test.ts (в `npm test`).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = 'supabase/functions/_shared';

const head = (src) =>
  `/* АВТО-СГЕНЕРИРОВАНО из ${src} (scripts/sync-server-engine.mjs) — НЕ редактировать. */\n`;

/** Возвращает { имя_файла: содержимое } для генерируемых _shared-модулей.
 *  Чистая функция (только чтение src) — используется и CLI, и тестом паритета. */
export function buildFiles() {
  const types = head('src/engine/types.ts') + readFileSync('src/engine/types.ts', 'utf8');

  // short.ts <- shortNardy.ts (в клиенте импорт './types' без расширения — Deno требует .ts)
  const short = head('src/engine/shortNardy.ts')
    + readFileSync('src/engine/shortNardy.ts', 'utf8').replace(/from '\.\/types'/g, "from './types.ts'");

  // long.ts <- longNardy.ts (уже импортирует './types.ts')
  const long = head('src/engine/longNardy.ts') + readFileSync('src/engine/longNardy.ts', 'utf8');

  // core.ts <- core.ts (переименовываем импорты модулей движка на серверные имена)
  const core = head('src/engine/core.ts')
    + readFileSync('src/engine/core.ts', 'utf8')
      .replace(/from '\.\/shortNardy\.ts'/g, "from './short.ts'")
      .replace(/from '\.\/longNardy\.ts'/g, "from './long.ts'");

  // rules.ts <- src/game/rules.ts (импорты на локальные .ts)
  const rules = head('src/game/rules.ts')
    + readFileSync('src/game/rules.ts', 'utf8')
      .replace(/from '\.\.\/engine\/types'/g, "from './types.ts'")
      .replace(/from '\.\.\/engine\/core'/g, "from './core.ts'");

  return { 'types.ts': types, 'short.ts': short, 'long.ts': long, 'core.ts': core, 'rules.ts': rules };
}

/** Устаревшие файлы, которых в _shared быть не должно. */
const OBSOLETE = ['engine.ts'];

function run() {
  const check = process.argv.includes('--check');
  const files = buildFiles();

  if (check) {
    const stale = [];
    for (const [name, content] of Object.entries(files)) {
      const path = `${OUT}/${name}`;
      const cur = existsSync(path) ? readFileSync(path, 'utf8') : null;
      if (cur !== content) stale.push(name);
    }
    for (const name of OBSOLETE) if (existsSync(`${OUT}/${name}`)) stale.push(`${name} (лишний)`);
    if (stale.length) {
      console.error('x _shared расходится с src/engine:', stale.join(', '));
      console.error('  Запустите: npm run sync:engine');
      process.exit(1);
    }
    console.log('ok: _shared в синхроне с src/engine');
    return;
  }

  mkdirSync(OUT, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(`${OUT}/${name}`, content);
  for (const name of OBSOLETE) {
    if (!existsSync(`${OUT}/${name}`)) continue;
    try {
      rmSync(`${OUT}/${name}`);
      console.log(`удалён устаревший ${OUT}/${name}`);
    } catch (e) {
      console.warn(`не удалось удалить ${OUT}/${name} (${e.code ?? e}); удалите вручную`);
    }
  }
  console.log('synced:', `${OUT}/{types,short,long,core,rules}.ts`);
}

// Запускаем CLI только при прямом вызове, не при импорте из теста.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run();
