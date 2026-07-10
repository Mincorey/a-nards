// Точки на грани кубика (значение 1..6), доли грани 0..1.
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
};

function Die({ x, y, size, value }: { x: number; y: number; size: number; value: number }) {
  const pr = size * 0.09;
  return (
    <g className="bd-die">
      <rect x={x} y={y} width={size} height={size} rx={size * 0.18} className="bd-die__face" />
      {(PIPS[value] ?? []).map(([px, py], i) => (
        <circle key={i} cx={x + px * size} cy={y + py * size} r={pr} className="bd-die__pip" />
      ))}
    </g>
  );
}

/** Кубики рисуются вокруг центра (cx,cy). */
export default function Dice({ values, cx, cy, size }: { values: number[]; cx: number; cy: number; size: number }) {
  const gap = size * 0.35;
  const vals = values.slice(0, 4);
  const totalW = vals.length * size + (vals.length - 1) * gap;
  let x = cx - totalW / 2;
  const y = cy - size / 2;
  return (
    <g>
      {vals.map((v, i) => {
        const die = <Die key={i} x={x} y={y} size={size} value={v} />;
        x += size + gap;
        return die;
      })}
    </g>
  );
}
