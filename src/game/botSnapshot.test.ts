import { describe, it, expect } from 'vitest';
import * as E from '../engine/core';
import { parsePersisted, serializePersisted, SCHEMA_VERSION } from './botSnapshot';
import type { GameSnapshot } from './useGame';

const makeSnap = (): GameSnapshot => ({
  game: E.initState('short'),
  phase: 'humanRoll',
  message: 'Ваш ход',
  winner: null,
  rollId: 3,
});

const base = () => ({
  variant: 'short' as const,
  difficulty: 'medium' as const,
  started: true,
  setupOpen: false,
  snap: makeSnap(),
});

describe('botSnapshot — версионирование и валидация (L4)', () => {
  it('round-trip: сериализация → разбор возвращает те же данные + версию', () => {
    const raw = serializePersisted(base());
    const p = parsePersisted(raw);
    expect(p).not.toBeNull();
    expect(p!.version).toBe(SCHEMA_VERSION);
    expect(p!.variant).toBe('short');
    expect(p!.started).toBe(true);
    expect(p!.snap.phase).toBe('humanRoll');
    expect(p!.snap.game.pts).toHaveLength(24);
  });

  it('другая версия схемы → отбраковка (null)', () => {
    const obj = { version: SCHEMA_VERSION + 1, ...base() };
    expect(parsePersisted(JSON.stringify(obj))).toBeNull();
  });

  it('снимок без поля version (старый формат) → отбраковка', () => {
    const obj = { ...base() }; // без version
    expect(parsePersisted(JSON.stringify(obj))).toBeNull();
  });

  it('битый JSON → null (без исключения)', () => {
    expect(parsePersisted('{не json')).toBeNull();
  });

  it('null/пустая строка → null', () => {
    expect(parsePersisted(null)).toBeNull();
    expect(parsePersisted('')).toBeNull();
  });

  it('повреждённый снимок (pts не длины 24) → отбраковка', () => {
    const bad = { version: SCHEMA_VERSION, ...base(), snap: { ...makeSnap(), game: { pts: [1, 2], bar: {}, off: {} } } };
    expect(parsePersisted(JSON.stringify(bad))).toBeNull();
  });

  it('недопустимый variant → отбраковка', () => {
    const bad = { version: SCHEMA_VERSION, ...base(), variant: 'chess' };
    expect(parsePersisted(JSON.stringify(bad))).toBeNull();
  });
});
