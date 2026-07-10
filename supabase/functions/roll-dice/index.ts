/* roll-dice — серверный бросок кубиков текущего игрока.
   Криптостойкий ГСЧ (secureRng) — броски НЕ предсказуемы клиентом (аудит H2).
   Оптимистичная блокировка по updated_at (аудит M4) — защита от двойного броска. */
import * as E from '../_shared/core.ts';
import { allowedMoves } from '../_shared/rules.ts';
import { admin, requireUser, json, corsHeaders, HttpError, errToResponse, secureRng } from '../_shared/util.ts';
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
    if (game.status !== 'playing') throw new HttpError(409, 'Партия завершена');

    const { data: seat } = await db.from('table_seats')
      .select('color').eq('table_id', game.table_id).eq('user_id', user.id).maybeSingle();
    if (!seat) throw new HttpError(403, 'Вы не за этим столом');
    if (seat.color !== game.turn) throw new HttpError(409, 'Сейчас не ваш ход');

    const state = game.state as GameState;
    if (state.rolled) throw new HttpError(409, 'Кубики уже брошены');

    const rev = game.updated_at as string;
    E.startTurn(state, secureRng);

    let ply = game.ply;
    const noMoves = allowedMoves(state).length === 0;
    const passRoll = state.rolled;
    if (noMoves) {
      E.endTurn(state);
      ply += 1;
    }

    // Защищённый апдейт (оптимистичная блокировка) — до записи авто-паса.
    const { data: updated, error } = await db.from('games').update({
      state, turn: state.turn, dice: state.dice, rolled: state.rolled, ply,
    }).eq('id', game_id).eq('updated_at', rev).select().maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!updated) throw new HttpError(409, 'Состояние партии изменилось — обновите и повторите');

    // Нет ходов — фиксируем авто-пас в журнале уже после успешного апдейта.
    if (noMoves) {
      await db.from('moves').insert({ game_id, player_id: user.id, ply: game.ply, roll: passRoll, moves: [] });
    }

    return json({ game: updated }, 200, req);
  } catch (e) {
    return errToResponse(e, req);
  }
});
