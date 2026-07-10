/* =============================================================================
 * Dice3D.tsx — Объёмные кубики (HTML/CSS 3D-оверлей поверх SVG-доски).
 * -----------------------------------------------------------------------------
 * SVG не умеет настоящий 3D (preserve-3d), поэтому кубики рисуются HTML-слоем,
 * абсолютно позиционированным над доской. Каждый куб — 6 граней с точками;
 * при новом броске (rollId) куб «кувыркается» и приземляется на выпавшее
 * значение. Обороты накапливаются монотонно, поэтому анимация играет и при
 * первом появлении, и при каждом следующем броске.
 * Учитывает prefers-reduced-motion (без кувырка — мгновенная установка грани).
 * ========================================================================== */
import { useEffect, useRef, useState } from 'react';
import './dice3d.css';

/** Точки на грани (как в 2D-кубике), доли грани 0..1. */
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
};

/** Раскладка значений по граням куба (противоположные грани в сумме = 7). */
const FACE = { front: 1, back: 6, right: 3, left: 4, top: 5, bottom: 2 } as const;

/** Базовый поворот куба, приводящий нужное значение на переднюю грань. */
function restRotation(value: number): { rx: number; ry: number } {
  switch (value) {
    case 1: return { rx: 0, ry: 0 };     // front
    case 6: return { rx: 0, ry: 180 };   // back
    case 3: return { rx: 0, ry: -90 };   // right → front
    case 4: return { rx: 0, ry: 90 };    // left → front
    case 5: return { rx: -90, ry: 0 };   // top → front
    case 2: return { rx: 90, ry: 0 };    // bottom → front
    default: return { rx: 0, ry: 0 };
  }
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Face({ value, transform }: { value: number; transform: string }) {
  return (
    <div className="d3-face" style={{ transform }}>
      {PIPS[value].map(([x, y], i) => (
        <span key={i} className="d3-pip" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
      ))}
    </div>
  );
}

/**
 * Один куб. `dir` (+1/-1) задаёт сторону кувырка, чтобы два кубика крутились
 * по-разному. Обороты копятся в `accRef`, поэтому каждый новый rollId даёт
 * полноценный кувырок и точное приземление на грань.
 */
function Cube({ value, rollId, dir, used }: { value: number; rollId: number; dir: 1 | -1; used: boolean }) {
  const rest = restRotation(value);
  const [rot, setRot] = useState(() => ({ ...rest }));
  const accRef = useRef(0);

  useEffect(() => {
    const r = restRotation(value);
    if (prefersReducedMotion()) { setRot(r); return; }
    accRef.current += 2; // +2 полных оборота на каждый бросок
    setRot({ rx: r.rx + dir * 360 * accRef.current, ry: r.ry - 360 * accRef.current });
  }, [value, rollId, dir]);

  const half = 'translateZ(var(--d3-half))';
  return (
    <div className={'d3-cube' + (used ? ' is-used' : '')}>
      <div className="d3-cube__inner" style={{ transform: `rotateX(${rot.rx}deg) rotateY(${rot.ry}deg)` }}>
        <Face value={FACE.front} transform={`rotateY(0deg) ${half}`} />
        <Face value={FACE.back} transform={`rotateY(180deg) ${half}`} />
        <Face value={FACE.right} transform={`rotateY(90deg) ${half}`} />
        <Face value={FACE.left} transform={`rotateY(-90deg) ${half}`} />
        <Face value={FACE.top} transform={`rotateX(90deg) ${half}`} />
        <Face value={FACE.bottom} transform={`rotateX(-90deg) ${half}`} />
      </div>
    </div>
  );
}

export interface Dice3DProps {
  /** Выпавшая пара (исходный бросок). */
  values: number[];
  /** Сколько ходов кубиков ещё не израсходовано (для затемнения). */
  remaining?: number;
  /** Меняется при каждом новом броске — триггер кувырка. */
  rollId: number;
  size: number;   // px, ребро куба
  left: number;   // % центра по X в контейнере
  top: number;    // % центра по Y
}

export default function Dice3D({ values, remaining, rollId, size, left, top }: Dice3DProps) {
  if (values.length < 2) return null;
  const [a, b] = values;
  const isDouble = a === b;
  const total = isDouble ? 4 : 2;
  const used = remaining == null ? 0 : total - remaining;

  return (
    <div
      className="d3-layer"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        ['--d3-size' as string]: `${size}px`,
        ['--d3-half' as string]: `${size / 2}px`,
      }}
    >
      <Cube value={a} rollId={rollId} dir={1} used={!isDouble && used >= 1} />
      <Cube value={b} rollId={rollId} dir={-1} used={!isDouble && used >= 2} />
    </div>
  );
}
