import { describe, it, expect } from 'vitest';
import { shouldClaimTimeout, turnClock, TURN_LIMIT_MS, MAIN_TIME_MS, EXTRA_TIME_MS } from './timeout';

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

describe('turnClock — двухступенчатые часы хода (основное 90с + доп. 30с)', () => {
  const now = 1_000_000_000_000;
  const started = (agoMs: number) => iso(now - agoMs);

  it('полный лимит = основное + дополнительное', () => {
    expect(TURN_LIMIT_MS).toBe(MAIN_TIME_MS + EXTRA_TIME_MS);
  });

  it('идёт основное время → не в экстре, mainLeft > 0, extraLeft полный', () => {
    const c = turnClock(started(10_000), now);
    expect(c.inExtra).toBe(false);
    expect(c.expired).toBe(false);
    expect(c.mainLeftMs).toBe(MAIN_TIME_MS - 10_000);
    expect(c.extraLeftMs).toBe(EXTRA_TIME_MS);
  });

  it('основное истекло → началось дополнительное (звонок timer_bell)', () => {
    const c = turnClock(started(MAIN_TIME_MS + 1000), now);
    expect(c.inExtra).toBe(true);
    expect(c.expired).toBe(false);
    expect(c.mainLeftMs).toBe(0);
    expect(c.extraLeftMs).toBe(EXTRA_TIME_MS - 1000);
  });

  it('осталось ≤10с доп. времени (момент countdown_10s)', () => {
    const c = turnClock(started(MAIN_TIME_MS + EXTRA_TIME_MS - 10_000), now);
    expect(c.inExtra).toBe(true);
    expect(c.extraLeftMs).toBe(10_000);
  });

  it('весь лимит вышел → expired, отсчёты по нулям', () => {
    const c = turnClock(started(TURN_LIMIT_MS + 1), now);
    expect(c.expired).toBe(true);
    expect(c.inExtra).toBe(false);
    expect(c.mainLeftMs).toBe(0);
    expect(c.extraLeftMs).toBe(0);
  });

  it('updated_at в будущем (рассинхрон часов) → как будто ход только начался', () => {
    const c = turnClock(started(-5000), now);
    expect(c.mainLeftMs).toBe(MAIN_TIME_MS);
    expect(c.inExtra).toBe(false);
  });
});
