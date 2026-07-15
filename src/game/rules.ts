/* =============================================================================
 * rules.ts — Правила хода поверх движка: обязательное максимальное
 * использование кубиков и правило «играть больший кубик, если можно лишь один».
 * -----------------------------------------------------------------------------
 * allowedMoves(s) — разрешённые ПЕРВЫЕ ходы в текущем состоянии (после фильтра
 * максимальности). Применяя их по одному и каждый раз пересчитывая, мы
 * гарантируем максимальное использование кубиков за ход.
 * ========================================================================== */
import type { GameState, Move } from '../engine/types';
import * as E from '../engine/core';

const key = (m: Move) => `${m.from}>${m.to}:${m.die}`;

function uniqueMoves(moves: Move[]): Move[] {
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const m of moves) {
    const k = key(m);
    if (!seen.has(k)) { seen.add(k); out.push(m); }
  }
  return out;
}

/**
 * Каноническая сигнатура состояния для мемоизации перебора.
 * Захватывает всё, что влияет на продолжение хода: расстановку, бар, вынос,
 * чей ход, ОСТАВШИЕСЯ кубики (порядок не важен → сортируем) и снятое с головы.
 */
function stateSig(st: GameState): string {
  const dice = [...st.dice].sort((a, b) => a - b).join(',');
  return `${st.turn}|${st.pts.join(',')}|${st.bar.w},${st.bar.b}|` +
    `${st.off.w},${st.off.b}|${dice}|${st.headUsed ?? 0}`;
}

/**
 * Диагностика: сколько уникальных состояний было раскрыто при последнем вызове
 * maximalSequences. Благодаря мемоизации по транспозициям это число доказуемо
 * ограничено количеством различных достижимых за ход позиций (мало). Используется
 * в тестах, чтобы гарантировать, что предохранитель GUARD никогда не срабатывает.
 */
let lastExpansions = 0;
export function getLastExpansions(): number {
  return lastExpansions;
}

/** Верхняя граница раскрытий (недостижима при нормальной игре, см. rules.test). */
const GUARD = 200000;

/**
 * Все максимальные полные последовательности ходов для текущих кубиков.
 * Возвращает массив последовательностей одинаковой (максимальной) длины.
 *
 * Перебор мемоизируется по сигнатуре состояния: разные порядки одних и тех же
 * ходов приводят к одной позиции (транспозиция) и считаются один раз. Это
 * убирает комбинаторный взрыв — без мемоизации число раскрытий на тяжёлых
 * позициях (дубли, длинные нарды) доходило до ~7000 и в пределе могло превысить
 * старый лимит 20000, обрезав список легальных ходов. Теперь глубина ≤ 4
 * полуходов, а число уникальных состояний — сотни, так что GUARD не срабатывает.
 */
export function maximalSequences(s: GameState): Move[][] {
  // memo: сигнатура состояния → все МАКСИМАЛЬНЫЕ продолжения из него (относительные).
  const memo = new Map<string, Move[][]>();
  let guard = 0;

  // Возвращает список максимальных по длине продолжений из состояния st.
  // Пустое продолжение [] означает «ходов больше нет» (длина 0).
  function rec(st: GameState): Move[][] {
    const sig = stateSig(st);
    const cached = memo.get(sig);
    if (cached) return cached;
    if (guard++ > GUARD) return [[]]; // предохранитель (в норме недостижим)

    const moves = uniqueMoves(E.allLegalMoves(st));
    let best: Move[][] = [[]];
    if (moves.length > 0) {
      let bestLen = 0;
      best = [];
      for (const m of moves) {
        const ns = E.cloneState(st);
        E.applyMove(ns, m.from, m.to, m.die);
        for (const sub of rec(ns)) {
          const len = sub.length + 1;
          if (len > bestLen) { bestLen = len; best = [[m, ...sub]]; }
          else if (len === bestLen) best.push([m, ...sub]);
        }
      }
      if (best.length === 0) best = [[]];
    }
    memo.set(sig, best);
    return best;
  }

  const all = rec(E.cloneState(s));
  lastExpansions = guard;
  let results = all.filter((seq) => seq.length > 0);
  const maxLen = results.reduce((mx, seq) => Math.max(mx, seq.length), 0);

  if (maxLen === 0) return [];

  // Правило: если за ход можно использовать только ОДИН кубик и числа разные —
  // обязаны сыграть больший.
  if (maxLen === 1 && s.rolled && s.rolled[0] !== s.rolled[1]) {
    const larger = Math.max(s.rolled[0], s.rolled[1]);
    const withLarger = results.filter((seq) => seq[0].die === larger);
    if (withLarger.length > 0) results = withLarger;
  }
  return results;
}

/** Разрешённые первые ходы (с учётом максимальности и правила большего кубика). */
export function allowedMoves(s: GameState): Move[] {
  const seqs = maximalSequences(s);
  return uniqueMoves(seqs.map((seq) => seq[0]));
}

/** Есть ли вообще ход в текущем состоянии. */
export function canMove(s: GameState): boolean {
  return E.allLegalMoves(s).length > 0;
}

/** Разрешённые цели для выбранного источника (индекс пункта или 'bar'). */
export function targetsFrom(s: GameState, from: number | 'bar'): Move[] {
  return allowedMoves(s).filter((m) => m.from === from);
}

/**
 * «Конечные» точки для ОДНОЙ шашки из `from` — цепочки длиной ≥2 полуходов,
 * где каждый следующий полуход продолжает ТУ ЖЕ шашку (последовательное
 * использование обоих кубиков, а для дублей — до четырёх). Нужны, чтобы игрок
 * мог одним кликом сразу переместить шашку в максимально далёкую доступную
 * точку, не тыкая по промежуточным. Каждый достижимый конечный пункт возвращается
 * один раз, с кратчайшей ведущей к нему последовательностью полуходов.
 *
 * Легальность и максимальность гарантируются тем, что и первый полуход, и все
 * продолжения берутся из allowedMoves(...) соответствующего состояния — то есть
 * цепочка всегда является частью максимальной последовательности хода.
 */
export function chainedTargetsFrom(s: GameState, from: number | 'bar'): { to: number | 'off'; seq: Move[] }[] {
  const out = new Map<string, Move[]>();

  const walk = (st: GameState, pos: number, acc: Move[]): void => {
    const conts = allowedMoves(st).filter((m) => m.from === pos);
    for (const m of conts) {
      const seq = [...acc, m];
      const k = String(m.to);
      if (!out.has(k)) out.set(k, seq);
      if (m.to === 'off') continue; // с выноса продолжать нечем
      const ns = E.cloneState(st);
      E.applyMove(ns, m.from, m.to, m.die);
      walk(ns, m.to, seq);
    }
  };

  const first = allowedMoves(s).filter((m) => m.from === from);
  for (const m1 of first) {
    if (m1.to === 'off') continue;
    const s1 = E.cloneState(s);
    E.applyMove(s1, m1.from, m1.to, m1.die);
    walk(s1, m1.to, [m1]);
  }

  return [...out.entries()].map(([to, seq]) => ({ to: to === 'off' ? 'off' : Number(to), seq }));
}

/** Источники, из которых есть разрешённый ход. */
export function legalSources(s: GameState): Set<number | 'bar'> {
  return new Set(allowedMoves(s).map((m) => m.from));
}
