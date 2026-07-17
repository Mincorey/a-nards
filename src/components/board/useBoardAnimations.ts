import { useEffect, useRef, useState } from 'react';
import type { GameState, Color } from '../../engine/types';
import {
  CHECKER_R, checkerPos, barPos, offPos, type PointGeom,
} from './boardLayout';
import { playChecker } from '../../lib/sound';

/* ===========================================================================
 * useBoardAnimations — вся логика «перелёта» одной фишки между слотами
 * (пункт/бар/вынос) вместо мгновенного исчезновения в одном месте и появления
 * в другом. Вынесено из Board.tsx для читаемости; поведение не изменено.
 *
 * Перемещение обнаруживается диффом предыдущего и нового состояния: если ровно
 * один слот потерял ровно одну фишку, а другой (того же цвета) ровно одну
 * получил — это обычный ход, и рисуется поверх доски плавно летящая фишка от
 * старой точки к новой, на время пряча «настоящую» фишку в месте назначения.
 * При БОЕ (взятии) дифф сложнее — атакующая фишка приходит на пункт, а сбитая
 * фишка соперника уходит на бар; тогда анимируются ОБЕ фишки и заметно медленнее.
 * ========================================================================== */

export type Loc = 'bar' | 'off' | number;

export interface Flight {
  id: number;
  color: Color;
  r: number;
  duration: number;
  from: { cx: number; cy: number };
  to: { cx: number; cy: number };
  destLoc: Loc;
  phase: 'start' | 'go';
  /** Сбитая фишка соперника, одновременно улетающая на бар (только при бое). */
  victim?: { color: Color; r: number; from: { cx: number; cy: number }; to: { cx: number; cy: number } };
}

/* Анти-фантом: окно защиты от повторной анимации одного и того же перемещения
 * при сетевой «осцилляции» состояния (дубль/реордер входящих обновлений, когда
 * доска на короткое время возвращается к уже виденной позиции). Должно быть
 * заведомо больше самой длинной анимации перелёта (1500 мс). */
const FLIGHT_GUARD_MS = 2500;

/** Хеш позиции ТОЛЬКО по фишкам (пункты/бар/вынос) — без хода/кубиков. */
function posHash(s: GameState): string {
  return s.pts.join(',') + '|' + s.bar.w + ',' + s.bar.b + '|' + s.off.w + ',' + s.off.b;
}

function slotCounts(s: GameState): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < 24; i++) {
    const v = s.pts[i];
    if (v > 0) m.set(`w:${i}`, v);
    else if (v < 0) m.set(`b:${i}`, -v);
  }
  if (s.bar.w) m.set('w:bar', s.bar.w);
  if (s.bar.b) m.set('b:bar', s.bar.b);
  if (s.off.w) m.set('w:off', s.off.w);
  if (s.off.b) m.set('b:off', s.off.b);
  return m;
}

function parseKey(k: string): { color: Color; loc: Loc } {
  const [c, loc] = k.split(':');
  return { color: c as Color, loc: loc === 'bar' || loc === 'off' ? loc : Number(loc) };
}

/** Индекс пункта в домашней зоне цвета (белые 0..5, чёрные 18..23) — там, откуда
 *  возможен вынос за один кубик. Вынос с пункта ВНЕ дома в дифф-анимации означает
 *  схлопнутую цепочку (аутфилд→дом→вынос за один ход). */
function isHomeIdx(color: Color, idx: number): boolean {
  return color === 'w' ? idx >= 0 && idx <= 5 : idx >= 18 && idx <= 23;
}

function slotPos(
  loc: Loc, color: Color, countAtSlot: number, points: PointGeom[], viewer: Color,
): { cx: number; cy: number; r: number } {
  if (loc === 'bar') {
    const p = barPos(color, Math.max(countAtSlot - 1, 0), viewer);
    return { cx: p.cx, cy: p.cy, r: CHECKER_R * 0.85 };
  }
  if (loc === 'off') {
    const p = offPos(color, Math.max(countAtSlot - 1, 0), viewer);
    return { cx: p.cx, cy: p.cy, r: p.r };
  }
  const shown = Math.min(countAtSlot, 6);
  const p = checkerPos(points[loc], Math.max(shown - 1, 0), Math.max(shown, 1));
  return { cx: p.cx, cy: p.cy, r: CHECKER_R };
}

export interface BoardAnimations {
  flight: Flight | null;
  /** Индекс пункта, чью верхнюю «настоящую» фишку прячем, пока летит оверлей. */
  suppressPointIdx: number | null;
  suppressBarColor: Color | null;
  suppressOffColor: Color | null;
}

/**
 * @param state    текущее игровое состояние
 * @param myColor  цвет локального игрока (чужие ходы анимируются медленнее); null для игры с ботом-наблюдателем
 * @param points   геометрия пунктов в перспективе зрителя
 * @param viewer   чья перспектива (для bar/off позиций)
 */
export function useBoardAnimations(
  state: GameState,
  myColor: Color | undefined,
  points: PointGeom[],
  viewer: Color,
): BoardAnimations {
  const prevStateRef = useRef<GameState | null>(null);
  const flightIdRef = useRef(0);
  const [flight, setFlight] = useState<Flight | null>(null);
  // История недавних позиций — чтобы не проигрывать полёт повторно при осцилляции.
  const recentPosRef = useRef<{ h: string; t: number }[]>([]);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    // Регистрируем текущую позицию и проверяем, не возвращаемся ли мы к недавней
    // (осцилляция из-за дубля/реордера сетевого состояния). Такое «перемещение»
    // не анимируем — иначе появляется фантомная вторая анимация того же хода.
    const now = Date.now();
    const curHash = posHash(state);
    const recent = recentPosRef.current.filter((e) => now - e.t < FLIGHT_GUARD_MS);
    const revisit = recent.some((e) => e.h === curHash);
    recent.push({ h: curHash, t: now });
    recentPosRef.current = recent;
    if (!prev || prev.variant !== state.variant) return; // первый рендер / новая партия — не анимируем
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (revisit) return; // возврат к недавней позиции — не проигрываем полёт повторно

    const before = slotCounts(prev);
    const after = slotCounts(state);
    const keys = new Set([...before.keys(), ...after.keys()]);
    interface Delta { key: string; d: number; color: Color; loc: Loc; }
    const deltas: Delta[] = [];
    for (const k of keys) {
      const d = (after.get(k) ?? 0) - (before.get(k) ?? 0);
      if (d === 0) continue;
      if (Math.abs(d) !== 1) return; // необычный диф (восстановление/дубль-скачок) — не анимируем
      const p = parseKey(k);
      deltas.push({ key: k, d, color: p.color, loc: p.loc });
    }
    const plus = deltas.filter((x) => x.d === 1);
    const minus = deltas.filter((x) => x.d === -1);

    // Обычный ход: один источник (−1) и одна цель (+1) одного цвета.
    if (plus.length === 1 && minus.length === 1 && plus[0].color === minus[0].color) {
      const src = minus[0];
      const dst = plus[0];
      // ВЫНОС «схлопнутой цепочкой»: если шашка выносится (dst='off'), но её
      // ИСТОЧНИК — НЕ в домашней зоне игрока, значит это цепочка аутфилд→дом→вынос,
      // применённая за один шаг (dst-дифф схлопнулся в «аутфилд→off»). Прямой
      // перелёт из аутфилда к центру выглядит как «фантомная фишка, летящая с
      // противоположной стороны доски». Не анимируем — фишка просто появится в
      // лотке (bd-off--enter). Обычный вынос из дома анимируется как прежде.
      if (dst.loc === 'off' && typeof src.loc === 'number' && !isHomeIdx(src.color, src.loc)) { playChecker(); return; }
      const from = slotPos(src.loc, src.color, before.get(src.key)!, points, viewer);
      const to = slotPos(dst.loc, dst.color, after.get(dst.key)!, points, viewer);
      const isMine = myColor != null && src.color === myColor;
      flightIdRef.current += 1;
      setFlight({
        id: flightIdRef.current,
        color: src.color,
        r: to.r,
        duration: isMine ? 260 : 1400, // чужой ход — медленнее, чтобы было видно, куда пошла фишка
        from: { cx: from.cx, cy: from.cy },
        to: { cx: to.cx, cy: to.cy },
        destLoc: dst.loc,
        phase: 'start',
      });
      return;
    }

    // Бой (взятие блота): атакующая фишка приходит на пункт, а сбитая фишка
    // соперника ОДНОВРЕМЕННО улетает на бар. Анимируем ОБЕ и заметно медленнее —
    // чтобы было ясно видно и куда пошла фишка, и что именно её сбило.
    if (plus.length === 2 && minus.length === 2) {
      const victimBar = plus.find((p) => p.loc === 'bar');
      const moverDst = plus.find((p) => p.loc !== 'bar');
      if (!victimBar || !moverDst) return;
      const moverColor = moverDst.color;
      const victimColor = victimBar.color;
      if (moverColor === victimColor) return;
      const moverSrc = minus.find((m) => m.color === moverColor);
      const victimSrc = minus.find((m) => m.color === victimColor);
      if (!moverSrc || !victimSrc) return;

      const from = slotPos(moverSrc.loc, moverColor, before.get(moverSrc.key)!, points, viewer);
      const to = slotPos(moverDst.loc, moverColor, after.get(moverDst.key)!, points, viewer);
      const vFrom = slotPos(victimSrc.loc, victimColor, before.get(victimSrc.key)!, points, viewer);
      const vTo = slotPos('bar', victimColor, after.get(victimBar.key)!, points, viewer);
      const isMine = myColor != null && moverColor === myColor;
      flightIdRef.current += 1;
      setFlight({
        id: flightIdRef.current,
        color: moverColor,
        r: to.r,
        duration: isMine ? 950 : 1500,
        from: { cx: from.cx, cy: from.cy },
        to: { cx: to.cx, cy: to.cy },
        destLoc: moverDst.loc,
        phase: 'start',
        victim: {
          color: victimColor,
          r: vFrom.r,
          from: { cx: vFrom.cx, cy: vFrom.cy },
          to: { cx: vTo.cx, cy: vTo.cy },
        },
      });
      return;
    }
  }, [state, myColor, points, viewer]);

  // Через пару кадров после монтирования «трогаем» transform → включается transition.
  useEffect(() => {
    if (!flight || flight.phase !== 'start') return;
    const id = flight.id;
    let raf1 = 0, raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setFlight((f) => (f && f.id === id ? { ...f, phase: 'go' } : f));
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [flight]);

  // По завершении перелёта убираем оверлей — «настоящая» фишка уже на месте.
  useEffect(() => {
    if (!flight || flight.phase !== 'go') return;
    const id = flight.id;
    const t = window.setTimeout(() => {
      playChecker(); // «стук» фишки о доску в момент приземления
      setFlight((f) => (f && f.id === id ? null : f));
    }, flight.duration + 60);
    return () => window.clearTimeout(t);
  }, [flight]);

  // Пока летит фишка — не рисуем «настоящую» верхнюю фишку в месте назначения.
  const suppressPointIdx = flight && typeof flight.destLoc === 'number' ? flight.destLoc : null;
  // При бое прячем «настоящую» сбитую фишку на баре, пока она летит; для обычного
  // хода на бар (в норме не бывает) — прежнее поведение.
  const suppressBarColor: Color | null = flight?.victim ? flight.victim.color : (flight && flight.destLoc === 'bar' ? flight.color : null);
  const suppressOffColor: Color | null = flight && flight.destLoc === 'off' ? flight.color : null;

  return { flight, suppressPointIdx, suppressBarColor, suppressOffColor };
}
