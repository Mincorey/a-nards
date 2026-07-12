import { describe, it, expect } from 'vitest';
import { shouldClaimTimeout, TURN_LIMIT_MS } from './timeout';

type G = { status: 'playing' | 'finished'; turn: 'w' | 'b'; updated_at: string };
const iso = (ms: number) => new Date(ms).toISOString();

describe('shouldClaimTimeout — клиентский триггер таймаута', () => {
  const now = 1_000_000_000_000;

  it('ход соперника и лимит+грейс истёк → true', () => {
    const g: G = { status: 'playing', turn: 'b', updated_at: iso(now - TURN_LIMIT_MS - 2000) };
    expect(shouldClaimTimeout(g, 'w', now)).toBe(true);
  });

  it('ход соперника, но лимит ещё НЕ истёк → false', () => {
    const g: G = { status: 'playing', turn: 'b', updated_at: iso(now - 30_000) };
    expect(shouldClaimTimeout(g, 'w', now)).toBe(false);
  });

  it('мой ход (даже если давно) → false (свой таймаут не засчитываю)', () => {
    const g: G = { status: 'playing', turn: 'w', updated_at: iso(now - TURN_LIMIT_MS - 60_000) };
    expect(shouldClaimTimeout(g, 'w', now)).toBe(false);
  });

  it('партия завершена → false', () => {
    const g: G = { status: 'finished', turn: 'b', updated_at: iso(now - TURN_LIMIT_MS - 5000) };
    expect(shouldClaimTimeout(g, 'w', now)).toBe(false);
  });

  it('нет цвета (зритель) → false', () => {
    const g: G = { status: 'playing', turn: 'b', updated_at: iso(now - TURN_LIMIT_MS - 5000) };
    expect(shouldClaimTimeout(g, null, now)).toBe(false);
  });

  it('ровно на границе (лимит без грейса) → false, с грейсом → true', () => {
    const g: G = { status: 'playing', turn: 'b', updated_at: iso(now - TURN_LIMIT_MS) };
    expect(shouldClaimTimeout(g, 'w', now)).toBe(false); // ещё нет грейса
    expect(shouldClaimTimeout(g, 'w', now + 1500)).toBe(true);
  });
});
