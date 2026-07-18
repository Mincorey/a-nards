// @vitest-environment jsdom
/* Тест «красивого завершения матча»: модалка результата появляется НЕ мгновенно
 * (игрок сначала видит, как последняя шашка легла в лоток), а после паузы —
 * и после появления НЕ исчезает сама. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

// Явная очистка порталов между тестами (без globals авто-cleanup RTL не работает).
afterEach(cleanup);
import GameOverModal from './GameOverModal';

vi.mock('../lib/sound', () => ({ playVictory: vi.fn() }));
vi.mock('../lib/music', () => ({ pauseMusic: vi.fn() }));

describe('GameOverModal — отложенное появление', () => {
  it('появляется после паузы (~900мс) и остаётся видимой', () => {
    vi.useFakeTimers();
    render(<GameOverModal won onLobby={() => {}} onClose={() => {}} />);

    // Сразу после конца партии модалки ещё нет — игрок видит доску.
    expect(screen.queryByText('Победа!')).toBeNull();

    // Через паузу — появилась.
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('Победа!')).toBeTruthy();

    // И не исчезает по своим таймерам.
    act(() => { vi.runAllTimers(); });
    expect(screen.getByText('Победа!')).toBeTruthy();
    vi.useRealTimers();
  });

  it('вариант поражения тоже появляется после паузы', () => {
    vi.useFakeTimers();
    render(<GameOverModal won={false} onLobby={() => {}} />);
    expect(screen.queryByText('Поражение')).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('Поражение')).toBeTruthy();
    vi.useRealTimers();
  });
});
