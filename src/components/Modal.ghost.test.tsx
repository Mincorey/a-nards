// @vitest-environment jsdom
/* Тест защиты от «сквозного» тапа (ghost click): синтетический mousedown,
 * прилетающий в оверлей сразу после открытия модалки (хвост того же тапа,
 * который её открыл), НЕ должен её закрывать. После взвода (~400мс) клик по
 * фону закрывает модалку как обычно. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act, fireEvent, cleanup } from '@testing-library/react';

// Явная очистка порталов между тестами (без globals авто-cleanup RTL не работает).
afterEach(cleanup);
import Modal from './Modal';

describe('Modal — защита от сквозного тапа', () => {
  it('mousedown по фону сразу после открытия игнорируется; после взвода — закрывает', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><p>тело</p></Modal>);
    const overlay = document.querySelector('.modal') as HTMLElement;
    expect(overlay).toBeTruthy();

    // Пока не взведена: pointer-events отключены, клик по фону игнорируется.
    expect(overlay.style.pointerEvents).toBe('none');
    fireEvent.mouseDown(overlay);
    expect(onClose).not.toHaveBeenCalled();

    // После взвода — обычное поведение.
    act(() => { vi.advanceTimersByTime(450); });
    expect(overlay.style.pointerEvents).not.toBe('none');
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('крестик закрытия тоже недоступен до взвода (pointer-events: none на оверлее)', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><p>тело</p></Modal>);
    const overlay = document.querySelector('.modal') as HTMLElement;
    // До взвода весь оверлей (включая карточку и кнопки) не принимает указатель.
    expect(overlay.style.pointerEvents).toBe('none');
    act(() => { vi.advanceTimersByTime(450); });
    expect(overlay.style.pointerEvents).not.toBe('none');
    vi.useRealTimers();
  });
});
