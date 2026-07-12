// @vitest-environment jsdom
/* Регресс: один бросок = ОДИН кувырок и ОДИН звук, в т.ч. под React.StrictMode.
 * Раньше StrictMode (dev) дважды прогонял mount-эффект куба, accRef накручивал
 * обороты вдвое (720°→1440°) и CSS-переход перезапускался = двойная анимация. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, act } from '@testing-library/react';

const playSpy = vi.fn();
vi.mock('../../lib/sound', () => ({ playDiceRoll: () => playSpy() }));

import Dice3D from './Dice3D';

beforeEach(() => {
  playSpy.mockClear();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return ++id; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

function maxDeg(container: HTMLElement): number {
  const el = container.querySelector('.d3-cube__inner') as HTMLElement;
  const nums = ((el.style.transform || '').match(/-?\d+(\.\d+)?deg/g) || []).map((s) => Math.abs(parseFloat(s)));
  return Math.max(0, ...nums);
}

describe('Dice3D — один бросок = одна анимация', () => {
  it('обычный рендер: 2 оборота (720°), звук один раз', () => {
    let c!: HTMLElement;
    act(() => { c = render(<Dice3D values={[5, 2]} rollId={1} size={60} left={50} top={50} />).container; });
    expect(maxDeg(c)).toBe(720);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('в StrictMode (как в приложении) НЕ удваивается: те же 720°, звук один раз', () => {
    let c!: HTMLElement;
    act(() => {
      c = render(
        <StrictMode><Dice3D values={[5, 2]} rollId={1} size={60} left={50} top={50} /></StrictMode>,
      ).container;
    });
    expect(maxDeg(c)).toBe(720);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
