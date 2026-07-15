/* pass-turn — пропуск хода, когда у ходящего игрока НЕТ доступных ходов.
   Вызывается клиентом ходящего ПОСЛЕ показа выпавших костей (см. п.5). Авторитет
   сервера: проверяем очередь, что кости брошены и что ходов действительно нет,
   затем передаём ход сопернику. Оптимистичная блокировка по updated_at. */
import * as E from '../_shared/core.ts';
import { allowedMoves } from '../_shared/rules.ts';
import { admin, requireUser, json, corsHeaders, HttpError, errToResponse } from '../_shared/util.ts';
import type { GameState } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  try {
    const user = await requireUser(req);
    const { game_id } = await req.json().catch(() => ({}));
    if (!game_id) throw new HttpError(400, 'Не указан game_id');

    const db = admin();
    const { data: game } = await db.from('games').select('*').eq('id', game_id).single();
    if (!game) throw new HttpError(404, 'Партия не найдена');
    if (game.status !== 'playing') return json({ game }, 200, req); // уже завершена/сменилась

    const { data: seat } = await db.from('table_seats')
      .select('color').eq('table_id', game.table_id).eq('user_id', user.id).maybeSingle();
    if (!seat) throw new HttpError(403, 'Вы не за этим столом');
    if (seat.color !== game.turn) throw new HttpError(409, 'Сейчас не ваш ход');

    const state = game.state as GameState;
    if (!state.rolled) throw new HttpError(409, 'Сначала бросьте кубики');
    if (allowedMoves(state).length > 0) throw new HttpError(409, 'Есть доступные ходы — пропуск невозможен');

    const rev = game.updated_at as string;
    const passRoll = state.rolled;
    const passPly = game.ply;
    E.endTurn(state);

    const { data: updated, error } = await db.from('games').update({
      state, turn: state.turn, dice: state.dice, rolled: state.rolled, ply: game.ply + 1,
    }).eq('id', game_id).eq('updated_at', rev).select().maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!updated) throw new HttpError(409, 'Состояние партии изменилось — обновите и повторите');

    await db.from('moves').insert({ game_id, player_id: user.id, ply: passPly, roll: passRoll, moves: [] });
    return json({ game: updated }, 200, req);
  } catch (e) {
    return errToResponse(e, req);
  }
});
