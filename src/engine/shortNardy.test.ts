import { describe, it, expect } from 'vitest';
import * as R from './shortNardy.ts';
import type { GameState } from './types.ts';

const empty = (): GameState => ({
  pts: new Array(24).fill(0),
  bar: { w: 0, b: 0 },
  off: { w: 0, b: 0 },
  turn: 'w',
  dice: [],
  rolled: null,
});

describe('shortNardy — базовые правила', () => {
  it('старт: по 15 шашек у каждого', () => {
    const s = R.initState();
    expect(R.checkerCount(s, 'w')).toBe(15);
    expect(R.checkerCount(s, 'b')).toBe(15);
  });

  it('белые ходят с убыванием индекса (6→5 кубиком 1)', () => {
    const s = R.initState();
    s.turn = 'w';
    s.dice = [1, 3];
    expect(R.legalMovesFrom(s, 5).some((m) => m.to === 4 && m.die === 1)).toBe(true);
  });

  it('взятие блота отправляет шашку на бар', () => {
    const s = R.initState();
    s.pts[11] = -1;
    s.turn = 'w';
    s.dice = [1];
    R.applyMove(s, 12, 11, 1);
    expect(s.bar.b).toBe(1);
    expect(s.pts[11]).toBe(1);
  });

  it('при шашке на баре сначала обязателен ввод с бара', () => {
    const s = R.initState();
    s.turn = 'w';
    s.bar.w = 1;
    s.dice = [2, 4];
    expect(R.allLegalMoves(s).every((m) => m.from === 'bar')).toBe(true);
  });

  it('вынос точным кубиком', () => {
    const s = empty();
    s.pts[2] = 1;
    s.dice = [3];
    expect(R.canBearOff(s, 'w', 2, 3)).toBe(true);
  });

  it('нет перебора при наличии более дальней шашки', () => {
    const s = empty();
    s.pts[1] = 1;
    s.pts[4] = 1;
    s.dice = [6];
    expect(R.canBearOff(s, 'w', 1, 6)).toBe(false);
  });

  it('дубль = 4 хода', () => {
    expect(R.diceToMoves([5, 5]).length).toBe(4);
    expect(R.diceToMoves([2, 5]).length).toBe(2);
  });

  it('endTurn передаёт ход и очищает кубики', () => {
    const s = R.initState();
    s.dice = [1, 2];
    R.endTurn(s);
    expect(s.turn).toBe('b');
    expect(s.dice.length).toBe(0);
  });

  it('детерминированный бросок с фиксированным ГСЧ', () => {
    const rng = () => 0; // всегда минимум → [1,1]
    expect(R.rollDice(rng)).toEqual([1, 1]);
  });
});

describe('shortNardy — целостность в авто-партиях', () => {
  it('200 случайных партий сохраняют по 15 шашек', () => {
    let bad = 0;
    for (let g = 0; g < 200; g++) {
      const st = R.initState();
      let safety = 0;
      while (!R.isGameOver(st) && safety++ < 2000) {
        st.dice = R.diceToMoves(R.rollDice());
        R.autoPlayTurn(st);
        if (R.checkerCount(st, 'w') !== 15 || R.checkerCount(st, 'b') !== 15) {
          bad++;
          break;
        }
        R.endTurn(st);
      }
    }
    expect(bad).toBe(0);
  });
});
