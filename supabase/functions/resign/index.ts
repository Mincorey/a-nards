/* resign — игрок сдаётся / выходит из партии во время игры. Засчитывает
   поражение вышедшему и победу сопернику (авторитет сервера). Ботов не
   касается: онлайн-партии всегда человек против человека. */
import { admin, requireUser, json, corsHeaders, HttpError, errToResponse } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  try {
    const user = await requireUser(req);
    const { game_id } = await req.json().catch(() => ({}));
    if (!game_id) throw new HttpError(400, 'Не указан game_id');

    const db = admin();
    const { data: game } = await db.from('games').select('*').eq('id', game_id).single();
    if (!game) throw new HttpError(404, 'Партия не найдена');
    // Уже завершена — просто вернём победителя (идемпотентно).
    if (game.status !== 'playing') return json({ ok: true, winner: game.winner }, 200, req);

    const { data: seat } = await db.from('table_seats')
      .select('color').eq('table_id', game.table_id).eq('user_id', user.id).maybeSingle();
    if (!seat) throw new HttpError(403, 'Вы не за этим столом');

    const winner = seat.color === 'w' ? 'b' : 'w'; // сдающийся проигрывает
    await db.rpc('finalize_game', { p_game_id: game_id, p_winner: winner });
    return json({ ok: true, winner }, 200, req);
  } catch (e) {
    return errToResponse(e, req);
  }
});
