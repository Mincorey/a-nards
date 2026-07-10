/* =============================================================================
 * nardy-engine.js — Движок правил классических (коротких) нард / backgammon
 * -----------------------------------------------------------------------------
 * Чистый JavaScript, без зависимостей и без DOM. Подходит для браузера, Node,
 * воркера или сервера. Это «логика и правила игры» в одном файле — фундамент,
 * на котором можно строить любой UI (PixiJS / Three.js / Canvas / React).
 *
 * Покрыто тестами: 26 проверок + 200 случайных авто-партий (см. низ файла,
 * запуск: `node nardy-engine.js --selftest`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * МОДЕЛЬ ДОСКИ
 *   24 пункта, индексы 0..23.
 *   pts[i] — знаковое целое: >0 — столько белых шашек, <0 — столько чёрных, 0 — пусто.
 *   Белые ('w'): двигаются по УБЫВАНИЮ индекса (23 → 0). Их «дом» — пункты 0..5.
 *                Выносят шашки за край ниже индекса 0.
 *   Чёрные ('b'): двигаются по ВОЗРАСТАНИЮ индекса (0 → 23). Их «дом» — пункты 18..23.
 *                 Выносят за край выше индекса 23.
 *   bar.{w,b} — число шашек на «баре» (сбитые, должны зайти заново).
 *   off.{w,b} — число вынесенных с доски шашек (15 = победа).
 *
 * ПРАВИЛА (классические короткие нарды / backgammon):
 *   • Старт: стандартная расстановка (по 15 шашек у каждого).
 *   • Ход: бросок 2 кубиков. Дубль (одинаковые) = 4 хода этим значением.
 *   • Каждый кубик = перемещение одной шашки на это число пунктов.
 *   • Нельзя встать на пункт, где ≥2 шашки соперника (он «закрыт»).
 *   • Встав на пункт с ровно 1 шашкой соперника — «бьём блот»: она уходит на бар.
 *   • Если есть шашки на баре — сначала обязательно завести их в дом соперника.
 *   • Вынос («bearing off»): когда все 15 шашек в своём доме — можно выносить за край.
 *   • Победа: тот, кто первым вынес все 15 шашек.
 *
 * ЧЕГО ЗДЕСЬ НЕТ (намеренно — добавляется поверх по желанию, см. README):
 *   • Куб удвоения (doubling cube), правила Crawford / Jacoby.
 *   • «Длинные нарды» (long nardy) — другой вариант с другим направлением и
 *     запретом бить; это отдельный режим, движок легко расширяется.
 *   • Бот/ИИ — генератор ходов (allLegalMoves) уже даёт всё нужное для простого ИИ.
 *   • Правило «обязан использовать оба кубика / больший кубик» — для прототипа
 *     не форсируется (ходы по одному легальны), при желании добавляется.
 * ========================================================================== */

(function (root) {
  'use strict';

  const WHITE = 'w', BLACK = 'b';

  /** Создать начальное состояние партии (стандартная расстановка). */
  function initState() {
    const pts = new Array(24).fill(0);
    // Белые (+):
    pts[23] = +2; pts[12] = +5; pts[7] = +3; pts[5] = +5;
    // Чёрные (−):
    pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
    return {
      pts,
      bar: { w: 0, b: 0 },
      off: { w: 0, b: 0 },
      turn: WHITE,     // чей ход
      dice: [],        // оставшиеся к разыгрыванию значения кубиков, напр. [3,5] или [6,6,6,6]
      rolled: null,    // как выпало (для отображения), напр. [3,5]
    };
  }

  const sign = (c) => (c === WHITE ? 1 : -1);
  const opp  = (c) => (c === WHITE ? BLACK : WHITE);

  /** Бросок двух кубиков → [a,b], значения 1..6. */
  function rollDice() {
    return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  }
  /** Преобразовать выпавший бросок в список ходов (дубль = 4 хода). */
  function diceToMoves(roll) {
    return roll[0] === roll[1] ? [roll[0], roll[0], roll[0], roll[0]] : [roll[0], roll[1]];
  }

  /**
   * Куда ведёт ход из `from` (индекс пункта или 'bar') кубиком `d` для цвета `c`.
   * @returns индекс 0..23, либо строку 'off' (вынос за край), либо число вне 0..23.
   */
  function destFor(c, from, d) {
    if (from === 'bar') return c === WHITE ? 24 - d : d - 1;   // точка входа с бара
    const t = c === WHITE ? from - d : from + d;
    if (c === WHITE && t < 0) return 'off';
    if (c === BLACK && t > 23) return 'off';
    return t;
  }

  const inHome = (c, idx) => c === WHITE ? (idx >= 0 && idx <= 5) : (idx >= 18 && idx <= 23);

  /** Все ли шашки цвета `c` в своём доме (условие для выноса). */
  function allInHome(s, c) {
    if ((c === WHITE ? s.bar.w : s.bar.b) > 0) return false;
    const sg = sign(c);
    for (let i = 0; i < 24; i++) if (s.pts[i] * sg > 0 && !inHome(c, i)) return false;
    return true;
  }

  /** Пункт `idx` закрыт для цвета `c` (≥2 шашки соперника)? */
  const isBlock = (s, c, idx) => s.pts[idx] * sign(c) <= -2;

  /** Дистанция пункта от края выноса (1 = ближайший к выносу). */
  const pipFromEdge = (c, idx) => c === WHITE ? idx + 1 : 24 - idx;

  /** Можно ли выносить шашку с `idx` кубиком `d`? (с учётом «перебора»). */
  function canBearOff(s, c, idx, d) {
    if (!allInHome(s, c)) return false;
    if (s.pts[idx] * sign(c) <= 0) return false;
    const pip = pipFromEdge(c, idx);
    if (pip === d) return true;
    if (d > pip) {
      // перебор разрешён, только если нет шашек на более дальних пунктах дома
      for (let i = 0; i < 24; i++)
        if (s.pts[i] * sign(c) > 0 && inHome(c, i) && pipFromEdge(c, i) > pip) return false;
      return true;
    }
    return false;
  }

  /**
   * Легальные ходы из конкретного источника (`from` = индекс или 'bar')
   * для ТЕКУЩЕГО состояния кубиков s.dice.
   * @returns [{from, to, die}] — to это индекс или 'off'.
   */
  function legalMovesFrom(s, from) {
    const c = s.turn, out = [];
    const dice = [...new Set(s.dice)];
    const onBar = c === WHITE ? s.bar.w : s.bar.b;
    if (onBar > 0 && from !== 'bar') return out;  // сначала ввести с бара
    for (const d of dice) {
      if (from === 'bar') {
        const dest = destFor(c, 'bar', d);
        if (!isBlock(s, c, dest)) out.push({ from: 'bar', to: dest, die: d });
        continue;
      }
      if (s.pts[from] * sign(c) <= 0) continue;   // не своя шашка
      const dest = destFor(c, from, d);
      if (dest === 'off') {
        if (canBearOff(s, c, from, d)) out.push({ from, to: 'off', die: d });
      } else if (!isBlock(s, c, dest)) {
        out.push({ from, to: dest, die: d });
      }
    }
    return out;
  }

  /** Все легальные ходы текущего игрока во всём состоянии. */
  function allLegalMoves(s) {
    const c = s.turn;
    const onBar = c === WHITE ? s.bar.w : s.bar.b;
    if (onBar > 0) return legalMovesFrom(s, 'bar');
    const res = [];
    for (let i = 0; i < 24; i++) if (s.pts[i] * sign(c) > 0) res.push(...legalMovesFrom(s, i));
    return res;
  }

  /** Есть ли хоть один ход. */
  const hasAnyMove = (s) => allLegalMoves(s).length > 0;

  /**
   * Применить конкретный ход (мутирует состояние s).
   * Обрабатывает взятие блота, бар, вынос; расходует один кубик.
   * @returns {{hit:boolean}} был ли сбит блот соперника.
   */
  function applyMove(s, from, to, die) {
    const c = s.turn, sg = sign(c);
    if (from === 'bar') { if (c === WHITE) s.bar.w--; else s.bar.b--; }
    else s.pts[from] -= sg;
    let hit = false;
    if (to === 'off') {
      if (c === WHITE) s.off.w++; else s.off.b++;
    } else {
      if (s.pts[to] * sg === -1) { // блот соперника → на бар
        s.pts[to] = 0;
        if (c === WHITE) s.bar.b++; else s.bar.w++;
        hit = true;
      }
      s.pts[to] += sg;
    }
    const di = s.dice.indexOf(die);
    if (di >= 0) s.dice.splice(di, 1);
    return { hit };
  }

  /** Передать ход сопернику (очистить кубики). */
  function endTurn(s) {
    s.turn = opp(s.turn);
    s.dice = [];
    s.rolled = null;
  }

  /** Начать ход: бросить и заполнить s.dice. @returns выпавший бросок [a,b]. */
  function startTurn(s) {
    s.rolled = rollDice();
    s.dice = diceToMoves(s.rolled);
    return s.rolled;
  }

  const isGameOver = (s) => s.off.w === 15 || s.off.b === 15;
  const winner = (s) => s.off.w === 15 ? WHITE : s.off.b === 15 ? BLACK : null;

  /** Pip-счёт игрока (сумма очков до полного выноса; меньше — лучше). */
  function pipCount(s, c) {
    let p = (c === WHITE ? s.bar.w : s.bar.b) * 25;
    for (let i = 0; i < 24; i++) {
      const v = s.pts[i];
      if (c === WHITE && v > 0) p += v * (i + 1);
      if (c === BLACK && v < 0) p += (-v) * (24 - i);
    }
    return p;
  }

  /** Контроль целостности: сколько всего шашек у цвета (всегда должно быть 15). */
  function checkerCount(s, c) {
    const sg = sign(c);
    let n = (c === WHITE ? s.bar.w : s.bar.b) + (c === WHITE ? s.off.w : s.off.b);
    for (let i = 0; i < 24; i++) { const v = s.pts[i] * sg; if (v > 0) n += v; }
    return n;
  }

  /** Глубокая копия состояния (для ИИ/перебора вариантов). */
  function cloneState(s) {
    return { pts: s.pts.slice(), bar: { ...s.bar }, off: { ...s.off },
             turn: s.turn, dice: s.dice.slice(), rolled: s.rolled ? s.rolled.slice() : null };
  }

  /**
   * Примитивный ИИ-ход: жадно разыгрывает все кубики случайными легальными
   * ходами. Возвращает список сделанных ходов. (Заготовка под нормального бота —
   * замените выбор хода на оценочную функцию: pipCount, безопасность блотов и т.п.)
   */
  function autoPlayTurn(s, pick) {
    pick = pick || ((moves) => moves[Math.floor(Math.random() * moves.length)]);
    const played = [];
    let guard = 0;
    while (s.dice.length > 0 && guard++ < 60) {
      const moves = allLegalMoves(s);
      if (moves.length === 0) break;
      const mv = pick(moves, s);
      applyMove(s, mv.from, mv.to, mv.die);
      played.push(mv);
    }
    return played;
  }

  const API = {
    WHITE, BLACK,
    initState, cloneState,
    rollDice, diceToMoves, startTurn, endTurn,
    destFor, legalMovesFrom, allLegalMoves, hasAnyMove, applyMove,
    isGameOver, winner, pipCount, allInHome, canBearOff, checkerCount,
    autoPlayTurn, opp,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Nardy = API;

  /* ----------------------------- SELF-TESTS -------------------------------- */
  if (typeof process !== 'undefined' && process.argv && process.argv.includes('--selftest')) {
    const R = API; let pass = 0, fail = 0;
    const ok = (c, m) => c ? pass++ : (fail++, console.log('  FAIL:', m));
    let s = R.initState();
    ok(R.checkerCount(s,'w')===15 && R.checkerCount(s,'b')===15, 'старт: по 15 шашек');
    s.turn='w'; s.dice=[1,3];
    ok(R.legalMovesFrom(s,5).some(m=>m.to===4&&m.die===1), 'белые 6→5');
    s=R.initState(); s.pts[11]=-1; s.turn='w'; s.dice=[1]; R.applyMove(s,12,11,1);
    ok(s.bar.b===1 && s.pts[11]===1, 'взятие блота → бар');
    s=R.initState(); s.turn='w'; s.bar.w=1; s.dice=[2,4];
    ok(R.allLegalMoves(s).every(m=>m.from==='bar'), 'сначала ввод с бара');
    s={pts:new Array(24).fill(0),bar:{w:0,b:0},off:{w:0,b:0},turn:'w',dice:[3]}; s.pts[2]=1;
    ok(R.canBearOff(s,'w',2,3), 'вынос точным кубиком');
    s={pts:new Array(24).fill(0),bar:{w:0,b:0},off:{w:0,b:0},turn:'w',dice:[6]}; s.pts[1]=1; s.pts[4]=1;
    ok(!R.canBearOff(s,'w',1,6), 'нет перебора при дальней шашке');
    ok(R.diceToMoves([5,5]).length===4, 'дубль = 4 хода');
    // 200 случайных партий — целостность
    let bad=0;
    for(let g=0; g<200; g++){ let st=R.initState(), safety=0;
      while(!R.isGameOver(st) && safety++<2000){ st.dice=R.diceToMoves(R.rollDice());
        R.autoPlayTurn(st);
        if(R.checkerCount(st,'w')!==15||R.checkerCount(st,'b')!==15){bad++;break;}
        R.endTurn(st); }
    }
    ok(bad===0, '200 авто-партий сохраняют 15 шашек ('+bad+' ошибок)');
    console.log(`\nSELF-TEST: ${pass} passed, ${fail} failed`);
    process.exit(fail?1:0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
