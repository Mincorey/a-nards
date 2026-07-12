/* claim-timeout — присутствующий соперник засчитывает таймаут ходящему игроку,
   если тот не сходил за отведённое время (напр. пропал интернет/свернул игру).
   Авторитет сервера: срок проверяется по games.updated_at (момент начала хода),
   а не по слову клиента — раньше времени победу засчитать нельзя. Вызвать может
   ТОЛЬКО соперник ходящего (тот, кто на месте и ждёт). */
import { admin, requireUser, json, corsHeaders, HttpError, errToResponse } from '../_shared/util.ts';

const TURN_LIMIT_MS = 90_000; // 90 секунд на ход

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  try {
    const user = await requireUser(req);
    const { game_id } = await req.json().catch(() => ({}));
    if (!game_id) throw new HttpError(400, 'Не указан game_id');

    const db = admin();
    const { data: game } = await db.from('games').select('*').eq('id', game_id).single();
    if (!game) throw new HttpError(404, 'Партия не найдена');
    if (game.status !== 'playing') return json({ ok: true, winner: game.winner }, 200, req);

    const { data: seat } = await db.from('table_seats')
      .select('color').eq('table_id', game.table_id).eq('user_id', user.id).maybeSingle();
    if (!seat) throw new HttpError(403, 'Вы не за этим столом');
    // Засчитать таймаут может только соперник ходящего, а не сам ходящий.
    if (seat.color === game.turn) throw new HttpError(409, 'Сейчас ваш ход');

    const idleMs = Date.now() - new Date(game.updated_at as string).getTime();
    if (idleMs < TURN_LIMIT_MS) throw new HttpError(409, 'Время хода ещё не истекло');

    const winner = seat.color; // соперник (на месте) побеждает; ходящий (game.turn) проигрывает
    await db.rpc('finalize_game', { p_game_id: game_id, p_winner: winner });
    return json({ ok: true, winner }, 200, req);
  } catch (e) {
    return errToResponse(e, req);
  }
});
