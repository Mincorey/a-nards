import { describe, it, expect } from 'vitest';
import { validateUsername, winRate } from './username';

describe('validateUsername', () => {
  it('принимает корректные имена', () => {
    expect(validateUsername('player1').ok).toBe(true);
    expect(validateUsername('Oleg_99').ok).toBe(true);
    expect(validateUsername('abc').ok).toBe(true);
  });
  it('отклоняет короткие/длинные', () => {
    expect(validateUsername('ab').ok).toBe(false);
    expect(validateUsername('a'.repeat(21)).ok).toBe(false);
  });
  it('отклоняет недопустимые символы', () => {
    expect(validateUsername('hi there').ok).toBe(false);
    expect(validateUsername('юзер').ok).toBe(false);
    expect(validateUsername('a-b-c').ok).toBe(false);
  });
});

describe('winRate', () => {
  it('0 при отсутствии партий', () => {
    expect(winRate(0, 0)).toBe(0);
  });
  it('считает процент и округляет', () => {
    expect(winRate(10, 5)).toBe(50);
    expect(winRate(3, 1)).toBe(33);
  });
});
