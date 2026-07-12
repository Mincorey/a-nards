// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import GameChat from './GameChat';
import { CHAT_PHRASES, type ChatMessage } from '../game/chat';

describe('GameChat — окно чата под доской (управляемое)', () => {
  afterEach(cleanup);

  it('своё сообщение выравнивается вправо, чужое — влево', () => {
    const messages: ChatMessage[] = [
      { id: '1', text: 'Хорош Брух 👌', name: 'Олег', color: 'w', own: true },
      { id: '2', text: 'Да ну нах.', name: 'Гость', color: 'b', own: false },
    ];
    const { container } = render(<GameChat messages={messages} onSend={() => {}} />);
    const list = container.querySelector('.gchat__list') as HTMLElement;
    expect(within(list).getByText('Хорош Брух 👌')).toBeTruthy();
    const rows = list.querySelectorAll('.gchat__msg');
    expect(rows[0].classList.contains('gchat__msg--self')).toBe(true);   // своё
    expect(rows[1].classList.contains('gchat__msg--self')).toBe(false);  // чужое
  });

  it('пустое состояние + выбор фразы вызывает onSend', () => {
    const onSend = vi.fn();
    render(<GameChat messages={[]} onSend={onSend} />);
    expect(screen.getByText(/Сообщений пока нет/)).toBeTruthy();
    expect(screen.queryByRole('option')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Выберите сообщение/ }));
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(CHAT_PHRASES.length);
    fireEvent.click(screen.getByRole('option', { name: 'Хорош Брух 👌' }));
    expect(onSend).toHaveBeenCalledWith('Хорош Брух 👌');
    expect(screen.queryByRole('option')).toBeNull();
  });
});
