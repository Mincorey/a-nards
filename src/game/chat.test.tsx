// @vitest-environment jsdom
/* Проверка онлайн-синхронизации чата: своё сообщение уходит в транспорт, а
 * входящее сообщение оппонента добавляется в ленту как чужое (own=false). */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameChat, type WireMessage, type ChatTransport } from './chat';

function makeTransport() {
  const sent: WireMessage[] = [];
  let cb: ((m: WireMessage) => void) | null = null;
  const transport: ChatTransport = {
    send: (m) => { sent.push(m); },
    subscribe: (fn) => { cb = fn; return () => { cb = null; }; },
  };
  return { transport, sent, receive: (m: WireMessage) => cb?.(m) };
}

describe('useGameChat — онлайн-синхронизация', () => {
  it('свои фразы уходят в транспорт и показываются как own', () => {
    const t = makeTransport();
    const { result } = renderHook(() =>
      useGameChat({ name: 'Олег', color: 'w' }, t.transport));

    act(() => result.current.send('Хорош Брух 👌'));

    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].text).toBe('Хорош Брух 👌');
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].own).toBe(true);
    expect(result.current.lastSelf?.text).toBe('Хорош Брух 👌');
  });

  it('входящая фраза оппонента добавляется как чужая (own=false)', () => {
    const t = makeTransport();
    const { result } = renderHook(() =>
      useGameChat({ name: 'Олег', color: 'w' }, t.transport));

    act(() => t.receive({ id: 'x1', text: 'Да ну нах.', name: 'Гость', color: 'b' }));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].own).toBe(false);
    expect(result.current.messages[0].name).toBe('Гость');
    expect(result.current.lastOpponent?.text).toBe('Да ну нах.');
  });

  it('дубликаты по id не добавляются повторно', () => {
    const t = makeTransport();
    const { result } = renderHook(() =>
      useGameChat({ name: 'Олег', color: 'w' }, t.transport));

    act(() => { t.receive({ id: 'dup', text: 'Сукаааа😯', name: 'Гость', color: 'b' }); });
    act(() => { t.receive({ id: 'dup', text: 'Сукаааа😯', name: 'Гость', color: 'b' }); });

    expect(result.current.messages).toHaveLength(1);
  });

  it('без транспорта (игра с ботом) фразы остаются локальными', () => {
    const { result } = renderHook(() => useGameChat({ name: 'Вы', color: 'w' }));
    act(() => result.current.send('Хорош Брух 👌'));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].own).toBe(true);
  });
});

