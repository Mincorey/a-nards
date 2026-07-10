/* play-move — применение одного хода с серверной валидацией (легальность,
   очередь, максимальное использование кубиков). Авторитет сервера.
   Оптимистичная блокировка по updated_at (аудит M4): гонка/двойная отправка
   одного хода не применится дважды — конкурентный апдейт отклоняется (409). */
import * as E from '../_shared/core.ts';
import { allowedMoves } from '../_shared/rules.ts';
import { admin, requireUser, json, corsHeaders, HttpError, errToResponse } from '../_shared/util.ts';
import type { GameState, MoveFrom, MoveTo } from '../_shared/types.ts';

interface InMove { from: MoveFrom; to: MoveTo; die: number; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const game_id = body.game_id as string | undefined;
    const move = body.move as InMove | undefined;
    if (!game_id || !move) throw new HttpError(400, 'Нужны game_id и move');

    const db = admin();
    const { data: game } = await db.from('games').select('*').eq('id', game_id).single();
    if (!game) throw new HttpError(404, 'Партия не найдена');
    if (game.status !== 'playing') throw new HttpError(409, 'Партия завершена');

    const { data: seat } = await db.from('table_seats')
      .select('color').eq('table_id', game.table_id).eq('user_id', user.id).maybeSingle();
    if (!seat) throw new HttpError(403, 'Вы не за этим столом');
    if (seat.color !== game.turn) throw new HttpError(409, 'Сейчас не ваш ход');

    const state = game.state as GameState;
    if (!state.rolled) throw new HttpError(409, 'Сначала бросьте кубики');
    if (state.dice.length === 0) throw new HttpError(409, 'Кубики уже использованы');

    const allowed = allowedMoves(state);
    const legal = allowed.find((m) => m.from === move.from && m.to === move.to && m.die === move.die);
    if (!legal) throw new HttpError(422, 'Недопустимый ход');

    // Токен версии для оптимистичной блокировки — фиксируем ДО применения хода.
    const rev = game.updated_at as string;
    const rollSnapshot = state.rolled;
    const movePly = game.ply;

    E.applyMove(state, move.from, move.to, move.die);

    const over = E.isGameOver(state);
    let ply = game.ply;
    if (!over && allowedMoves(state).length === 0) {
      E.endTurn(state);
      ply += 1;
    }

    // Сначала — защищённый апдейт (только если строку никто не менял с момента чтения).
    const { data: updated, error } = await db.from('games').update({
      state, turn: state.turn, dice: state.dice, rolled: state.rolled, ply,
    }).eq('id', game_id).eq('updated_at', rev).select().maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!updated) throw new HttpError(409, 'Состояние партии изменилось — обновите и повторите ход');

    // Апдейт удался — фиксируем ход в журнале.
    await db.from('moves').insert({
      game_id, player_id: user.id, ply: movePly, roll: rollSnapshot, moves: [move],
    });

    if (over) {
      const w = E.winner(state);
      await db.rpc('finalize_game', { p_game_id: game_id, p_winner: w });
      const { data: final } = await db.from('games').select('*').eq('id', game_id).single();
      return json({ game: final }, 200, req);
    }

    return json({ game: updated }, 200, req);
  } catch (e) {
    return errToResponse(e, req);
  }
});
