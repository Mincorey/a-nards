/* =============================================================================
 * send-contact — приём формы «Контакты» и отправка сообщения администратору
 * в Telegram. Публичный эндпоинт (вызывается с анон-ключом; логина не требует).
 *
 * Антиспам (несколько независимых слоёв):
 *   1) Honeypot-поле `company` — скрыто от людей; если заполнено → это бот.
 *   2) Тайм-трап `elapsed` — форму, отправленную быстрее MIN_ELAPSED_MS, шлёт бот.
 *   3) Лимиты длины (имя/сообщение) и белый список тем.
 *   4) Эвристика ссылок — слишком много URL в тексте → спам.
 *   5) Рейт-лимит по IP (не более MAX_PER_IP_HOUR за час) и глобальный за час.
 * Спам-попытки логируются со status='spam', но пользователю возвращаем ok
 * (кроме рейт-лимита), чтобы не подсказывать боту, что именно сработало.
 *
 * Секреты окружения (задать в Supabase → Edge Functions → Secrets):
 *   TELEGRAM_BOT_TOKEN       — токен бота от @BotFather.
 *   TELEGRAM_ADMIN_CHAT_ID   — числовой chat_id администратора (личный чат с ботом).
 * ========================================================================== */
import { admin, json, corsHeaders, HttpError, errToResponse } from '../_shared/util.ts';

const TOPICS = [
  'Вопрос по игре',
  'Проблема с пополнением',
  'Проблема с выводом средств',
  'Технический сбой / нашёл баг',
  'Предложение по улучшению',
  'Другое',
] as const;

const MIN_ELAPSED_MS = 3000;    // человек не заполнит форму быстрее 3 секунд
const MAX_PER_IP_HOUR = 5;      // не более 5 сообщений с одного IP в час
const MAX_TOTAL_HOUR = 60;      // общий предохранитель от массовой рассылки
const NAME_MAX = 60;
const MSG_MIN = 10;
const MSG_MAX = 2000;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  return xff.split(',')[0].trim() || 'unknown';
}

async function sendTelegram(name: string, topic: string, message: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID');
  if (!token || !chatId) throw new HttpError(500, 'Отправка временно недоступна (не настроен бот)');

  const text =
    '📬 <b>Новое сообщение с сайта A-NARDS</b>\n\n' +
    `👤 <b>Имя:</b> ${esc(name)}\n` +
    `🏷 <b>Тема:</b> ${esc(topic)}\n\n` +
    `💬 <b>Сообщение:</b>\n${esc(message)}`;

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new HttpError(502, `Telegram отклонил отправку: ${resp.status} ${body.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Метод не поддерживается');

    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? '').trim();
    const topic = String(body.topic ?? '').trim();
    const message = String(body.message ?? '').trim();
    const honeypot = String(body.company ?? '').trim();      // должно быть пустым
    const elapsed = Number(body.elapsed ?? 0);               // мс с момента открытия формы

    const db = admin();
    const ip = clientIp(req);
    const ua = (req.headers.get('user-agent') ?? '').slice(0, 300);
    const logSpam = () =>
      db.from('contact_messages').insert({ name: name.slice(0, NAME_MAX), topic, message: message.slice(0, MSG_MAX), ip, user_agent: ua, status: 'spam' });

    // 1) Honeypot и 2) тайм-трап — тихо «принимаем», но не шлём и метим как спам.
    if (honeypot) { await logSpam(); return json({ ok: true }, 200, req); }
    if (elapsed > 0 && elapsed < MIN_ELAPSED_MS) { await logSpam(); return json({ ok: true }, 200, req); }

    // 3) Валидация полей.
    if (name.length < 2 || name.length > NAME_MAX) throw new HttpError(400, 'Укажите имя (2–60 символов)');
    if (!TOPICS.includes(topic as typeof TOPICS[number])) throw new HttpError(400, 'Выберите тему из списка');
    if (message.length < MSG_MIN) throw new HttpError(400, `Сообщение слишком короткое (минимум ${MSG_MIN} символов)`);
    if (message.length > MSG_MAX) throw new HttpError(400, `Сообщение слишком длинное (максимум ${MSG_MAX} символов)`);

    // 4) Эвристика ссылок.
    const links = (message.match(/https?:\/\//gi) ?? []).length;
    if (links > 3) { await logSpam(); return json({ ok: true }, 200, req); }

    // 5) Рейт-лимит (по IP и глобальный) за последний час.
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    if (ip !== 'unknown') {
      const { count } = await db.from('contact_messages')
        .select('id', { count: 'exact', head: true })
        .eq('ip', ip).eq('status', 'sent').gte('created_at', hourAgo);
      if ((count ?? 0) >= MAX_PER_IP_HOUR) throw new HttpError(429, 'Слишком много сообщений. Попробуйте позже.');
    }
    const { count: total } = await db.from('contact_messages')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent').gte('created_at', hourAgo);
    if ((total ?? 0) >= MAX_TOTAL_HOUR) throw new HttpError(429, 'Сервис перегружен. Попробуйте позже.');

    // Отправка в Telegram + журнал.
    await sendTelegram(name, topic, message);
    await db.from('contact_messages').insert({ name, topic, message, ip, user_agent: ua, status: 'sent' });

    return json({ ok: true }, 200, req);
  } catch (e) {
    return errToResponse(e, req);
  }
});
