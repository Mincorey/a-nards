/* start-game — старт онлайн-партии за столом (нужно два места). Авторитет сервера. */
import * as E from '../_shared/core.ts';
import { admin, requireUser, json, corsHeaders, HttpError, errToResponse, secureRng } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  try {
    const user = await requireUser(req);
    const { table_id } = await req.json().catch(() => ({}));
    if (!table_id) throw new HttpError(400, 'Не указан table_id');

    const db = admin();
    const { data: table } = await db.from('game_tables').select('*').eq('id', table_id).single();
    if (!table) throw new HttpError(404, 'Стол не найден');
    const { data: seats } = await db.from('table_seats').select('*').eq('table_id', table_id);
    if (!seats || seats.length < 2) throw new HttpError(400, 'Нужно два игрока за столом');

    const isMember = table.owner_id === user.id || seats.some((s) => s.user_id === user.id);
    if (!isMember) throw new HttpError(403, 'Вы не за этим столом');

    // Денежный стол: перед стартом убеждаемся, что ОБА игрока внесли ставку
    // (эскроу заморожен при посадке). Защита от старта неоплаченной партии.
    const settings = (table.settings ?? {}) as { mode?: string; coins?: number };
    if (settings.mode === 'coins') {
      const stake = typeof settings.coins === 'number' ? Math.floor(settings.coins) : 0;
      if (stake > 0 && !seats.every((s) => (s.coins_locked ?? 0) >= stake)) {
        throw new HttpError(409, 'Не у всех игроков заморожена ставка — стол не может начаться');
      }
    }

    // Уже идёт партия — вернём её.
    const { data: existing } = await db.from('games')
      .select('*').eq('table_id', table_id).eq('status', 'playing').maybeSingle();
    if (existing) return json({ game: existing }, 200, req);

    const state = E.initState(table.variant as 'short' | 'long');
    // Жеребьёвка «кто ходит первым»: по одной кости на цвет (крипто-ГСЧ), при
    // равенстве перебрасываем; у кого больше — тот и начинает. Кости сохраняем
    // в games.opening, чтобы ОБА игрока увидели одинаковый бросок на сторонах доски.
    const d6 = () => 1 + Math.floor(secureRng() * 6);
    let ow = d6(), ob = d6();
    while (ow === ob) { ow = d6(); ob = d6(); }
    const first: 'w' | 'b' = ow > ob ? 'w' : 'b';
    state.turn = first;

    const { data: game, error } = await db.from('games').insert({
      table_id, variant: table.variant, state, turn: first,
      dice: [], rolled: null, status: 'playing', ply: 0, opening: { w: ow, b: ob },
    }).select().single();
    if (error) throw new HttpError(500, error.message);

    await db.from('game_tables').update({ status: 'playing' }).eq('id', table_id);
    return json({ game }, 200, req);
  } catch (e) {
    return errToResponse(e, req);
  }
});
