// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import GameChat from './GameChat';

describe('GameChat — чат с готовыми фразами', () => {
  afterEach(cleanup);
  it('показывает пустое состояние и выпадающий список фраз', () => {
    render(<GameChat selfName="Олег" selfColor="w" />);
    expect(screen.getByText(/Сообщений пока нет/)).toBeTruthy();
    // Плейсхолдер + 3 тестовые фразы в списке.
    const select = screen.getByLabelText('Выберите сообщение') as HTMLSelectElement;
    expect(select.options.length).toBe(4);
    expect(within(select).getByText('Вот бля...')).toBeTruthy();
    expect(within(select).getByText('Пиздец')).toBeTruthy();
  });

  it('выбор фразы добавляет облачко в ленту от игрока', () => {
    render(<GameChat selfName="Олег" selfColor="w" />);
    const select = screen.getByLabelText('Выберите сообщение') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Пиздец' } });
    // Появилось облачко с текстом.
    const list = document.querySelector('.gchat__list')!;
    expect(within(list as HTMLElement).getByText('Пиздец')).toBeTruthy();
    // Аватар-инициал автора.
    expect(within(list as HTMLElement).getByText('О')).toBeTruthy();
    // Список сбросился на плейсхолдер.
    expect(select.value).toBe('');
  });
});
