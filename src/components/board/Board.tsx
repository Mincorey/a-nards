import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GameState, Color } from '../../engine/types';
import {
  VB, DIVIDER, COL_W, CHECKER_R, DICE_AREA,
  ALL_POINTS, pointCell, checkerPos, barPos, offPos,
} from './boardLayout';
import Dice3D from './Dice3D';
import { IconDice } from '../icons';
import './board.css';

const BOARD_IMG = '/assets/board.png';
const WHITE_IMG = '/assets/fishka_white.png';
const BLACK_IMG = '/assets/fishka_black.png';

export type Spot = number | 'bar' | 'off';

export interface BoardProps {
  state: GameState;
  selected?: Spot | null;
  sources?: Set<number | 'bar'>;
  targets?: Set<number | 'off'>;
  onPick?: (spot: Spot) => void;
  /** Меняется при каждом броске — триггер анимации кубика. */
  rollId?: number;
  /** Сколько ходов кубиков ещё не израсходовано. */
  diceRemaining?: number;
  /** Показать кнопку «Бросить» по центру доски (когда мой ход до броска). */
  canRoll?: boolean;
  onRoll?: () => void;
  /** Цвет локального игрока — только чтобы анимировать чужие ходы медленнее. */
  myColor?: Color;
}

const IMG = (c: Color) => (c === 'w' ? WHITE_IMG : BLACK_IMG);

function Checker({ cx, cy, color, r = CHECKER_R, cls = '' }:
  { cx: number; cy: number; color: Color; r?: number; cls?: string }) {
  // Позиционируем через transform → CSS-переход даёт плавную осадку стопки.
  return (
    <image href={IMG(color)} width={r * 2} height={r * 2}
      className={'bd-checker ' + cls}
      style={{ transform: `translate(${cx - r}px, ${cy - r}px)` }} />
  );
}

function CountBadge({ cx, cy, n }: { cx: number; cy: number; n: number }) {
  return (
    <g className="bd-badge">
      <circle cx={cx} cy={cy} r={CHECKER_R * 0.46} />
      <text x={cx} y={cy} dominantBaseline="central" textAnchor="middle">{n}</text>
    </g>
  );
}

function PointStack({ state, index, lift }: { state: GameState; index: number; lift: number }) {
  const v = state.pts[index];
  if (v === 0) return null;
  const color: Color = v > 0 ? 'w' : 'b';
  const count = Math.abs(v) - lift; // вычитаем поднятую перетаскиванием/анимацией фишку
  if (count <= 0) return null;
  const g = ALL_POINTS[index];
  const shown = Math.min(count, 6);
  const items = [];
  for (let k = 0; k < shown; k++) {
    const { cx, cy } = checkerPos(g, k, shown);
    items.push(<Checker key={k} cx={cx} cy={cy} color={color} />);
  }
  if (count > 6) {
    const top = checkerPos(g, shown - 1, shown);
    items.push(<CountBadge key="b" cx={top.cx} cy={top.cy} n={count} />);
  }
  return <g>{items}</g>;
}

interface Drag { from: number | 'bar'; color: Color; x: number; y: number; }

/* ===========================================================================
 * «Перелёт» одной фишки между слотами (пункт/бар/вынос) — вместо мгновенного
 * исчезновения в одном месте и появления в другом. Обнаруживается диффом
 * предыдущего и нового состояния: если ровно один слот потерял ровно одну
 * фишку, а другой (того же цвета) ровно одну получил — это обычный ход, и мы
 * рисуем поверх доски плавно летящую фишку от старой точки к новой, на время
 * прячем «настоящую» фишку в месте назначения. Взятие (когда фишка соперника
 * одновременно уходит на бар) даёт более сложный диф — в этом случае просто
 * не анимируем перелёт (перестраховка), доска обновится как раньше.
 * ========================================================================== */
type Loc = 'bar' | 'off' | number;

interface Flight {
  id: number;
  color: Color;
  r: number;
  duration: number;
  from: { cx: number; cy: number };
  to: { cx: number; cy: number };
  destLoc: Loc;
  phase: 'start' | 'go';
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

function slotPos(loc: Loc, color: Color, countAtSlot: number): { cx: number; cy: number; r: number } {
  if (loc === 'bar') {
    const p = barPos(color, Math.max(countAtSlot - 1, 0));
    return { cx: p.cx, cy: p.cy, r: CHECKER_R * 0.85 };
  }
  if (loc === 'off') {
    const p = offPos(color, Math.max(countAtSlot - 1, 0));
    return { cx: p.cx, cy: p.cy, r: p.r };
  }
  const shown = Math.min(countAtSlot, 6);
  const p = checkerPos(ALL_POINTS[loc], Math.max(shown - 1, 0), Math.max(shown, 1));
  return { cx: p.cx, cy: p.cy, r: CHECKER_R };
}

export default function Board({
  state, selected, sources, targets, onPick, rollId = 0, diceRemaining, canRoll, onRoll, myColor,
}: BoardProps) {
  const interactive = Boolean(onPick);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [diceSize, setDiceSize] = useState(56);

  // Px-размер кубика пропорционально ширине доски.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDiceSize(Math.max(34, el.clientWidth * 0.072)));
    ro.observe(el);
    setDiceSize(Math.max(34, el.clientWidth * 0.072));
    return () => ro.disconnect();
  }, []);

  /* ------------------------------- Перелёт фишки ------------------------- */
  const prevStateRef = useRef<GameState | null>(null);
  const flightIdRef = useRef(0);
  const [flight, setFlight] = useState<Flight | null>(null);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (!prev || prev.variant !== state.variant) return; // первый рендер / новая партия — не анимируем
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const before = slotCounts(prev);
    const after = slotCounts(state);
    const keys = new Set([...before.keys(), ...after.keys()]);
    let minusKey: string | null = null;
    let plusKey: string | null = null;
    let ambiguous = false;
    for (const k of keys) {
      const d = (after.get(k) ?? 0) - (before.get(k) ?? 0);
      if (d === 0) continue;
      if (d === -1 && minusKey === null) minusKey = k;
      else if (d === 1 && plusKey === null) plusKey = k;
      else { ambiguous = true; break; }
    }
    if (ambiguous || !minusKey || !plusKey) return;
    const src = parseKey(minusKey);
    const dst = parseKey(plusKey);
    if (src.color !== dst.color) return; // взятие фишки соперника — не пытаемся анимировать

    const fromCount = before.get(minusKey)!;
    const toCount = after.get(plusKey)!;
    const from = slotPos(src.loc, src.color, fromCount);
    const to = slotPos(dst.loc, dst.color, toCount);
    const isMine = myColor != null && src.color === myColor;
    flightIdRef.current += 1;
    setFlight({
      id: flightIdRef.current,
      color: src.color,
      r: to.r,
      duration: isMine ? 260 : 1400, // чужой ход — заметно медленнее, чтобы было видно, куда пошла фишка
      from: { cx: from.cx, cy: from.cy },
      to: { cx: to.cx, cy: to.cy },
      destLoc: dst.loc,
      phase: 'start',
    });
  }, [state, myColor]);

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
    const t = window.setTimeout(() => setFlight((f) => (f && f.id === id ? null : f)), flight.duration + 60);
    return () => window.clearTimeout(t);
  }, [flight]);

  // Пока летит фишка — не рисуем «настоящую» верхнюю фишку в месте назначения.
  const suppressPointIdx = flight && typeof flight.destLoc === 'number' ? flight.destLoc : null;
  const suppressBarColor = flight && flight.destLoc === 'bar' ? flight.color : null;
  const suppressOffColor = flight && flight.destLoc === 'off' ? flight.color : null;

  // client → координаты viewBox.
  const toVB = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // Что под точкой: индекс пункта, 'divider' (перемычка) или null.
  const spotAt = useCallback((clientX: number, clientY: number): number | 'divider' | null => {
    const { x, y } = toVB(clientX, clientY);
    for (const g of ALL_POINTS) {
      const c = pointCell(g);
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return g.index;
    }
    if (x >= DIVIDER.x0 && x <= DIVIDER.x1 && y >= 120 && y <= VB.h - 120) return 'divider';
    return null;
  }, [toVB]);

  const resolveSource = useCallback((spot: number | 'divider' | null): (number | 'bar') | null => {
    if (typeof spot === 'number' && sources?.has(spot)) return spot;
    if (spot === 'divider' && sources?.has('bar')) return 'bar';
    return null;
  }, [sources]);

  const resolveTarget = useCallback((spot: number | 'divider' | null): (number | 'off') | null => {
    if (typeof spot === 'number' && targets?.has(spot)) return spot;
    if (spot === 'divider' && targets?.has('off')) return 'off';
    return null;
  }, [targets]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (!interactive) return;
    const spot = spotAt(e.clientX, e.clientY);
    // 1) Источник уже выбран и тап по легальной цели → завершаем ход.
    if (selected != null) {
      const tgt = resolveTarget(spot);
      if (tgt != null) { onPick!(tgt); return; }
    }
    // 2) Выбор/захват легального источника.
    const src = resolveSource(spot);
    if (src != null) {
      if (selected !== src) onPick!(src);
      const color: Color = src === 'bar'
        ? state.turn
        : (state.pts[src] > 0 ? 'w' : 'b');
      const { x, y } = toVB(e.clientX, e.clientY);
      setDrag({ from: src, color, x, y });
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    // 3) Пустой тап — снять выбор.
    if (selected != null) onPick!(-1);
  }, [interactive, spotAt, selected, resolveTarget, resolveSource, onPick, state, toVB]);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    setDrag((d) => {
      if (!d) return d;
      const { x, y } = toVB(e.clientX, e.clientY);
      return { ...d, x, y };
    });
  }, [toVB]);

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    setDrag((d) => {
      if (!d) return null;
      const spot = spotAt(e.clientX, e.clientY);
      const tgt = resolveTarget(spot);
      if (tgt != null && tgt !== d.from) onPick!(tgt);
      return null;
    });
  }, [spotAt, resolveTarget, onPick]);

  const liftFrom = drag && typeof drag.from === 'number' ? drag.from : null;
  const liftBarW = drag && drag.from === 'bar' && drag.color === 'w' ? 1 : 0;
  const liftBarB = drag && drag.from === 'bar' && drag.color === 'b' ? 1 : 0;
  const dragR = CHECKER_R * 1.06;

  return (
    <div className="bd-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className={'bd-svg' + (drag ? ' is-dragging' : '')}
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        role="img" aria-label="Игровая доска нард"
        onPointerDown={interactive ? onPointerDown : undefined}
        onPointerMove={interactive && drag ? onPointerMove : undefined}
        onPointerUp={interactive ? onPointerUp : undefined}
        onPointerCancel={interactive ? onPointerUp : undefined}
        style={{ touchAction: 'none' }}
      >
        <defs>
          <filter id="bd-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000" floodOpacity="0.4" />
          </filter>
        </defs>

        <image href={BOARD_IMG} x="0" y="0" width={VB.w} height={VB.h} preserveAspectRatio="xMidYMid meet" />

        {/* Подсветка легальных источников */}
        {interactive && ALL_POINTS.map((g) => {
          if (!sources?.has(g.index)) return null;
          const c = pointCell(g);
          return <rect key={'src' + g.index} x={c.x + 4} y={c.y} width={c.w - 8} height={c.h}
            rx={COL_W / 2} className="bd-hl bd-hl--source" />;
        })}
        {interactive && typeof selected === 'number' && (() => {
          const c = pointCell(ALL_POINTS[selected]);
          return <rect x={c.x + 4} y={c.y} width={c.w - 8} height={c.h} rx={COL_W / 2}
            className="bd-hl bd-hl--selected" />;
        })()}

        {/* Зона выноса (подсветка цели) */}
        {interactive && targets?.has('off') && (
          <rect x={DIVIDER.x0 + 4} y={120} width={DIVIDER.x1 - DIVIDER.x0 - 8} height={VB.h - 240}
            rx="14" className="bd-tray is-target" />
        )}

        {/* Фишки на пунктах */}
        <g filter="url(#bd-shadow)">
          {ALL_POINTS.map((g) =>
            <PointStack key={g.index} state={state} index={g.index}
              lift={(liftFrom === g.index ? 1 : 0) + (suppressPointIdx === g.index ? 1 : 0)} />)}
        </g>

        {/* Фишки на баре */}
        <g filter="url(#bd-shadow)">
          {Array.from({ length: state.bar.w - liftBarW - (suppressBarColor === 'w' ? 1 : 0) }, (_, k) => { const p = barPos('w', k); return <Checker key={'bw' + k} cx={p.cx} cy={p.cy} color="w" r={CHECKER_R * 0.85} cls="bd-checker--enter" />; })}
          {Array.from({ length: state.bar.b - liftBarB - (suppressBarColor === 'b' ? 1 : 0) }, (_, k) => { const p = barPos('b', k); return <Checker key={'bb' + k} cx={p.cx} cy={p.cy} color="b" r={CHECKER_R * 0.85} cls="bd-checker--enter" />; })}
        </g>

        {/* Вынесенные фишки — мини-стопка реальных фишек в трее выноса */}
        <g filter="url(#bd-shadow)">
          {Array.from({ length: state.off.w - (suppressOffColor === 'w' ? 1 : 0) }, (_, k) => { const p = offPos('w', k); return <Checker key={'ow' + k} cx={p.cx} cy={p.cy} color="w" r={p.r} cls="bd-checker--enter" />; })}
          {Array.from({ length: state.off.b - (suppressOffColor === 'b' ? 1 : 0) }, (_, k) => { const p = offPos('b', k); return <Checker key={'ob' + k} cx={p.cx} cy={p.cy} color="b" r={p.r} cls="bd-checker--enter" />; })}
          {state.off.w > 0 && (() => { const p = offPos('w', state.off.w - 1); return <CountBadge key="ocw" cx={p.cx} cy={p.cy - p.r * 1.5} n={state.off.w} />; })()}
          {state.off.b > 0 && (() => { const p = offPos('b', state.off.b - 1); return <CountBadge key="ocb" cx={p.cx} cy={p.cy + p.r * 1.5} n={state.off.b} />; })()}
        </g>

        {/* Маркеры целей */}
        {interactive && ALL_POINTS.map((g) => {
          if (!targets?.has(g.index)) return null;
          const count = Math.abs(state.pts[g.index]);
          const pos = checkerPos(g, count, Math.max(count + 1, 1));
          return <circle key={'tg' + g.index} cx={g.cx} cy={pos.cy} r={CHECKER_R * 0.55}
            className="bd-target" />;
        })}

        {/* Летящая фишка обычного хода — плавный перелёт от старой точки к новой */}
        {flight && (
          <image href={IMG(flight.color)} width={flight.r * 2} height={flight.r * 2}
            className="bd-checker bd-fly"
            style={{
              transform: `translate(${(flight.phase === 'go' ? flight.to.cx : flight.from.cx) - flight.r}px, ${(flight.phase === 'go' ? flight.to.cy : flight.from.cy) - flight.r}px)`,
              transition: flight.phase === 'go' ? `transform ${flight.duration}ms cubic-bezier(0.3, 0.1, 0.2, 1)` : 'none',
            }} />
        )}

        {/* Поднятая (перетаскиваемая) фишка — поверх всего */}
        {drag && (
          <image href={IMG(drag.color)} width={dragR * 2} height={dragR * 2}
            className="bd-checker bd-checker--drag"
            style={{ transform: `translate(${drag.x - dragR}px, ${drag.y - dragR}px)` }} />
        )}
      </svg>

      {/* 3D-кубики — HTML-оверлей над доской */}
      {state.rolled && (
        <Dice3D
          values={state.rolled}
          remaining={diceRemaining ?? state.dice.length}
          rollId={rollId}
          size={diceSize}
          left={(DICE_AREA.cx / VB.w) * 100}
          top={(DICE_AREA.cy / VB.h) * 100}
        />
      )}

      {/* Кнопка «Бросить» по центру доски — когда мой ход до броска */}
      {canRoll && onRoll && (
        <button
          type="button"
          className="bd-roll"
          onClick={onRoll}
          style={{ left: `${(DICE_AREA.cx / VB.w) * 100}%`, top: `${(DICE_AREA.cy / VB.h) * 100}%` }}
        >
          <span className="bd-roll__ico"><IconDice /></span>
          <span>Бросить кубики</span>
        </button>
      )}
    </div>
  );
}
