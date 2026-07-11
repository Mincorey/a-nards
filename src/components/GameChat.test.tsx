// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import GameChat from './GameChat';

describe('GameChat — чат с готовыми фразами', () => {
  afterEach(cleanup);

  it('пустое состояние + триггер выпадающего списка', () => {
    render(<GameChat selfName="Олег" selfColor="w" />);
    expect(screen.getByText(/Сообщений пока нет/)).toBeTruthy();
    const trigger = screen.getByRole('button', { name: /Выберите сообщение/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // Меню закрыто — опций нет.
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('открытие меню и выбор фразы добавляет облачко от игрока', () => {
    render(<GameChat selfName="Олег" selfColor="w" />);
    fireEvent.click(screen.getByRole('button', { name: /Выберите сообщение/ }));
    // Меню открылось — 3 опции.
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(3);
    fireEvent.click(screen.getByRole('option', { name: 'Пиздец' }));
    // Облачко в ленте + аватар-инициал автора.
    const list = document.querySelector('.gchat__list') as HTMLElement;
    expect(within(list).getByText('Пиздец')).toBeTruthy();
    expect(within(list).getByText('О')).toBeTruthy();
    // Меню закрылось.
    expect(screen.queryByRole('option')).toBeNull();
  });
});
