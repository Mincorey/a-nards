import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GameState, Color } from '../../engine/types';
import {
  VB, DIVIDER, COL_W, CHECKER_R, DICE_AREA, MID_Y,
  allPoints, pointCell, checkerPos, barPos, offPos, type PointGeom,
} from './boardLayout';
import Dice3D, { OpeningDie } from './Dice3D';
import { IconDice } from '../icons';
import './board.css';
import { useBoardAnimations } from './useBoardAnimations';

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
  /** Цвет локального игрока: замедляет чужие ходы И ориентирует доску так, чтобы
   *  СВОЙ дом (зона выноса) был в правой-нижней четверти. По умолчанию — белые. */
  myColor?: Color;
  /** Жеребьёвка «кто ходит первым»: по одной кости на игрока (слева соперник, справа я). */
  opening?: { left: number; right: number; result: string | null; rollId: number } | null;
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

function PointStack({ state, g, lift }: { state: GameState; g: PointGeom; lift: number }) {
  const v = state.pts[g.index];
  if (v === 0) return null;
  const color: Color = v > 0 ? 'w' : 'b';
  const count = Math.abs(v) - lift; // вычитаем поднятую перетаскиванием/анимацией фишку
  if (count <= 0) return null;
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

export default function Board({
  state, selected, sources, targets, onPick, rollId = 0, diceRemaining, canRoll, onRoll, myColor, opening,
}: BoardProps) {
  const interactive = Boolean(onPick);
  const viewer: Color = myColor ?? 'w';
  // Раскладка пунктов в перспективе игрока (свой дом — низ-право).
  const points = useMemo(() => allPoints(viewer), [viewer]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [diceSize, setDiceSize] = useState(56);

  // Плашку «кто первый» показываем не сразу, а через ~0.9с после появления
  // кубиков жеребьёвки — сначала игрок видит, что выпало, затем результат.
  const [openingBannerShown, setOpeningBannerShown] = useState(false);
  useEffect(() => {
    if (!opening) { setOpeningBannerShown(false); return; }
    setOpeningBannerShown(false);
    const t = window.setTimeout(() => setOpeningBannerShown(true), 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opening?.rollId, Boolean(opening)]);

  // Px-размер кубика пропорционально ширине доски.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDiceSize(Math.max(34, el.clientWidth * 0.072)));
    ro.observe(el);
    setDiceSize(Math.max(34, el.clientWidth * 0.072));
    return () => ro.disconnect();
  }, []);

  // Анимации «перелёта» фишек (обычный ход и бой) вынесены в отдельный хук.
  const { flight, suppressPointIdx, suppressBarColor, suppressOffColor } =
    useBoardAnimations(state, myColor, points, viewer);

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
    for (const g of points) {
      const c = pointCell(g);
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return g.index;
    }
    if (x >= DIVIDER.x0 && x <= DIVIDER.x1 && y >= 120 && y <= VB.h - 120) return 'divider';
    return null;
  }, [toVB, points]);

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
        {interactive && points.map((g) => {
          if (!sources?.has(g.index)) return null;
          const c = pointCell(g);
          return <rect key={'src' + g.index} x={c.x + 4} y={c.y} width={c.w - 8} height={c.h}
            rx={COL_W / 2} className="bd-hl bd-hl--source" />;
        })}
        {interactive && typeof selected === 'number' && (() => {
          const c = pointCell(points[selected]);
          return <rect x={c.x + 4} y={c.y} width={c.w - 8} height={c.h} rx={COL_W / 2}
            className="bd-hl bd-hl--selected" />;
        })()}

        {/* Зона выноса (подсветка цели) — ТОЛЬКО в своей половине доски, где лоток
            выноса текущего игрока. Раньше зелёная полоса рисовалась на всю высоту
            перемычки и подсвечивала ещё и противоположную половину (у лотка
            соперника) — при сбросе это выглядело как «фантомный» второй вынос с
            другой стороны доски и путало игрока. */}
        {interactive && targets?.has('off') && (() => {
          const off0 = offPos(state.turn, 0, viewer);
          const bottom = off0.cy > MID_Y;      // низ ли доски лоток текущего игрока
          const y = bottom ? MID_Y + 8 : 120;
          const height = bottom ? (VB.h - 120) - (MID_Y + 8) : (MID_Y - 8) - 120;
          return (
            <rect x={DIVIDER.x0 + 4} y={y} width={DIVIDER.x1 - DIVIDER.x0 - 8} height={height}
              rx="14" className="bd-tray is-target" />
          );
        })()}

        {/* Фишки на пунктах */}
        <g filter="url(#bd-shadow)">
          {points.map((g) =>
            <PointStack key={g.index} state={state} g={g}
              lift={(liftFrom === g.index ? 1 : 0) + (suppressPointIdx === g.index ? 1 : 0)} />)}
        </g>

        {/* Фишки на баре */}
        <g filter="url(#bd-shadow)">
          {Array.from({ length: state.bar.w - liftBarW - (suppressBarColor === 'w' ? 1 : 0) }, (_, k) => { const p = barPos('w', k, viewer); return <Checker key={'bw' + k} cx={p.cx} cy={p.cy} color="w" r={CHECKER_R * 0.85} cls="bd-checker--enter" />; })}
          {Array.from({ length: state.bar.b - liftBarB - (suppressBarColor === 'b' ? 1 : 0) }, (_, k) => { const p = barPos('b', k, viewer); return <Checker key={'bb' + k} cx={p.cx} cy={p.cy} color="b" r={CHECKER_R * 0.85} cls="bd-checker--enter" />; })}
        </g>

        {/* Вынесенные фишки — мини-стопка реальных фишек в трее выноса */}
        <g filter="url(#bd-shadow)">
          {Array.from({ length: state.off.w - (suppressOffColor === 'w' ? 1 : 0) }, (_, k) => { const p = offPos('w', k, viewer); return <Checker key={'ow' + k} cx={p.cx} cy={p.cy} color="w" r={p.r} cls="bd-checker--enter" />; })}
          {Array.from({ length: state.off.b - (suppressOffColor === 'b' ? 1 : 0) }, (_, k) => { const p = offPos('b', k, viewer); return <Checker key={'ob' + k} cx={p.cx} cy={p.cy} color="b" r={p.r} cls="bd-checker--enter" />; })}
          {state.off.w > 0 && (() => { const p = offPos('w', state.off.w - 1, viewer); const sgn = p.cy > MID_Y ? -1 : 1; return <CountBadge key="ocw" cx={p.cx} cy={p.cy + sgn * p.r * 1.5} n={state.off.w} />; })()}
          {state.off.b > 0 && (() => { const p = offPos('b', state.off.b - 1, viewer); const sgn = p.cy > MID_Y ? -1 : 1; return <CountBadge key="ocb" cx={p.cx} cy={p.cy + sgn * p.r * 1.5} n={state.off.b} />; })()}
        </g>

        {/* Маркеры целей */}
        {interactive && points.map((g) => {
          if (!targets?.has(g.index)) return null;
          const count = Math.abs(state.pts[g.index]);
          const pos = checkerPos(g, count, Math.max(count + 1, 1));
          return <circle key={'tg' + g.index} cx={g.cx} cy={pos.cy} r={CHECKER_R * 0.55}
            className="bd-target" />;
        })}

        {/* Летящая сбитая фишка соперника — улетает на бар одновременно с боем */}
        {flight?.victim && (
          <image href={IMG(flight.victim.color)} width={flight.victim.r * 2} height={flight.victim.r * 2}
            className="bd-checker bd-fly"
            style={{
              transform: `translate(${(flight.phase === 'go' ? flight.victim.to.cx : flight.victim.from.cx) - flight.victim.r}px, ${(flight.phase === 'go' ? flight.victim.to.cy : flight.victim.from.cy) - flight.victim.r}px)`,
              transition: flight.phase === 'go' ? `transform ${flight.victim.duration}ms cubic-bezier(0.3, 0.1, 0.2, 1)` : 'none',
            }} />
        )}

        {/* Летящая фишка обычного хода / атакующая фишка боя — от старой точки к новой */}
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

      {/* Жеребьёвка «кто ходит первым» — по одной кости на стороне игрока + плашка. */}
      {opening && (
        <>
          <OpeningDie value={opening.left} rollId={opening.rollId} size={diceSize * 1.15} left={26} top={50} />
          <OpeningDie value={opening.right} rollId={opening.rollId} size={diceSize * 1.15} left={74} top={50} />
          {openingBannerShown && opening.result && (
            <div className="bd-firstbanner"><span>{opening.result}</span></div>
          )}
        </>
      )}

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

      {/* Кнопка «Бросить» по центру доски — когда мой ход до броска.
          Пока кости УЖЕ на столе (state.rolled) — кнопку не показываем, иначе
          золотая плашка перекрывает выпавшие кости (например, при пасе с бара,
          когда фаза остаётся «до броска» ещё пару секунд, а кости уже видны).
          Пока летит фишка (flight) — тоже НЕ показываем: кнопка не должна
          появляться раньше, чем завершится анимация перемещения шашек
          соперника (иначе по ней несколько раз тыкают вхолостую). */}
      {canRoll && onRoll && !state.rolled && !flight && (
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
