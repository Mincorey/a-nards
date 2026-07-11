// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import GameChat from './GameChat';
import type { ChatMessage } from '../game/chat';

describe('GameChat — окно чата под доской (управляемое)', () => {
  afterEach(cleanup);

  it('рендерит облачка из messages с аватаром-инициалом', () => {
    const messages: ChatMessage[] = [
      { id: 1, text: 'Пиздец', name: 'Олег', color: 'w' },
    ];
    render(<GameChat messages={messages} onSend={() => {}} />);
    const list = document.querySelector('.gchat__list') as HTMLElement;
    expect(within(list).getByText('Пиздец')).toBeTruthy();
    expect(within(list).getByText('О')).toBeTruthy();
  });

  it('пустое состояние + выбор фразы вызывает onSend', () => {
    const onSend = vi.fn();
    render(<GameChat messages={[]} onSend={onSend} />);
    expect(screen.getByText(/Сообщений пока нет/)).toBeTruthy();
    // Меню закрыто.
    expect(screen.queryByRole('option')).toBeNull();
    // Открыть и выбрать.
    fireEvent.click(screen.getByRole('button', { name: /Выберите сообщение/ }));
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(3);
    fireEvent.click(screen.getByRole('option', { name: 'Вот бля...' }));
    expect(onSend).toHaveBeenCalledWith('Вот бля...');
    // Меню закрылось.
    expect(screen.queryByRole('option')).toBeNull();
  });
});
