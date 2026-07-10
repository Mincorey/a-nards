/* =============================================================================
 * botSnapshot.ts — (де)сериализация и ВЕРСИОНИРОВАНИЕ снимка партии с ботом,
 * который BotGameSession хранит в sessionStorage (аудит L4).
 *
 * Зачем отдельный модуль: логику версии и валидации формата удобно покрыть
 * юнит-тестами без React/DOM (функции чистые, работают со строкой).
 *
 * Правило версии: при ЛЮБОМ несовместимом изменении формата GameState/снимка
 * поднимаем SCHEMA_VERSION — старые снимки (другой версии) при загрузке
 * отбраковываются, и партия просто начинается заново, а не падает/портится.
 * ========================================================================== */
import type { GameSnapshot } from './useGame';
import type { Variant } from '../engine/types';
import type { Difficulty } from './bot';

/** Ключ хранилища. */
export const SAVE_KEY = 'anards.botgame.v1';

/** Версия схемы снимка. Поднимать при несовместимых изменениях GameState/снимка. */
export const SCHEMA_VERSION = 1;

export interface Persisted {
  version: number;
  variant: Variant;
  difficulty: Difficulty;
  started: boolean;
  setupOpen: boolean;
  snap: GameSnapshot;
}

/** Базовая проверка формы снимка — защита от «мусора»/старых данных. */
function isValidSnapshot(s: unknown): s is GameSnapshot {
  if (!s || typeof s !== 'object') return false;
  const g = (s as GameSnapshot).game as unknown;
  if (!g || typeof g !== 'object') return false;
  const gs = g as { pts?: unknown; bar?: unknown; off?: unknown };
  if (!Array.isArray(gs.pts) || gs.pts.length !== 24) return false;
  if (!gs.bar || typeof gs.bar !== 'object') return false;
  if (!gs.off || typeof gs.off !== 'object') return false;
  if (typeof (s as GameSnapshot).phase !== 'string') return false;
  return true;
}

/**
 * Разбор сохранённой строки. Возвращает Persisted только для СОВПАДАЮЩЕЙ версии
 * схемы и валидного формата; иначе null (вызывающий сбросит ключ). Чистая
 * функция — не трогает хранилище (для тестируемости).
 */
export function parsePersisted(raw: string | null): Persisted | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const p = obj as Partial<Persisted>;
  if (p.version !== SCHEMA_VERSION) return null;      // другая/отсутствует версия
  if (typeof p.started !== 'boolean' || typeof p.setupOpen !== 'boolean') return null;
  if (p.variant !== 'short' && p.variant !== 'long') return null;
  if (!isValidSnapshot(p.snap)) return null;
  return p as Persisted;
}

/** Сериализация снимка со штампом текущей версии схемы. */
export function serializePersisted(data: Omit<Persisted, 'version'>): string {
  return JSON.stringify({ version: SCHEMA_VERSION, ...data });
}
