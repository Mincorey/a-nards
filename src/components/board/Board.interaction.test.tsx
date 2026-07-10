// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import Board from './Board';
import { ALL_POINTS, pointCell } from './boardLayout';
import type { GameState } from '../../engine/types';

// Мокаем SVG-координатное API jsdom: VB-координаты == clientX/clientY.
beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  // @ts-expect-error jsdom не реализует createSVGPoint
  SVGSVGElement.prototype.createSVGPoint = function () {
    return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } };
  };
  // @ts-expect-error jsdom не реализует getScreenCTM
  SVGSVGElement.prototype.getScreenCTM = function () {
    return { inverse() { return {}; } };
  };
});

function baseState(): GameState {
  const pts = new Array(24).fill(0);
  pts[5] = 3;   // белые
  pts[3] = 0;
  return { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn: 'w', dice: [2, 4], rolled: [2, 4] };
}

function center(index: number) {
  const c = pointCell(ALL_POINTS[index]);
  return { clientX: c.x + c.w / 2, clientY: c.y + c.h / 2 };
}

describe('Board interaction (tap + drag)', () => {
  it('тап по легальному источнику вызывает onPick(источник)', () => {
    cleanup();
    const onPick = vi.fn();
    const { container } = render(
      <Board state={baseState()} selected={null} sources={new Set([5])} targets={new Set()} onPick={onPick} />,
    );
    const svg = container.querySelector('svg')!;
    fireEvent.pointerDown(svg, center(5));
    expect(onPick).toHaveBeenCalledWith(5);
  });

  it('при выбранном источнике тап по легальной цели вызывает onPick(цель)', () => {
    cleanup();
    const onPick = vi.fn();
    const { container } = render(
      <Board state={baseState()} selected={5} sources={new Set([5])} targets={new Set([3])} onPick={onPick} />,
    );
    const svg = container.querySelector('svg')!;
    fireEvent.pointerDown(svg, center(3));
    expect(onPick).toHaveBeenCalledWith(3);
  });

  it('drag-drop: захват источника и отпускание на цели вызывает onPick(цель)', () => {
    cleanup();
    const onPick = vi.fn();
    const { container } = render(
      <Board state={baseState()} selected={5} sources={new Set([5])} targets={new Set([3])} onPick={onPick} />,
    );
    const svg = container.querySelector('svg')!;
    fireEvent.pointerDown(svg, { ...center(5), pointerId: 1 });   // захват (selected уже 5 → onPick не зовётся)
    fireEvent.pointerMove(svg, { ...center(3), pointerId: 1 });   // тащим
    fireEvent.pointerUp(svg, { ...center(3), pointerId: 1 });     // отпускаем на цели
    expect(onPick).toHaveBeenCalledWith(3);
  });

  it('drop вне легальной цели не делает ход (фишка возвращается)', () => {
    cleanup();
    const onPick = vi.fn();
    const { container } = render(
      <Board state={baseState()} selected={5} sources={new Set([5])} targets={new Set([3])} onPick={onPick} />,
    );
    const svg = container.querySelector('svg')!;
    fireEvent.pointerDown(svg, { ...center(5), pointerId: 1 });
    fireEvent.pointerUp(svg, { ...center(10), pointerId: 1 });    // пункт 10 не цель
    expect(onPick).not.toHaveBeenCalledWith(10);
  });
});
