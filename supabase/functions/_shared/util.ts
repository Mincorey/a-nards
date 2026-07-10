/* Общие утилиты Edge Functions: клиенты Supabase, аутентификация, CORS, RNG. */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* CORS (аудит M7). Разрешённые Origin настраиваются переменной окружения
 * ALLOWED_ORIGINS — список через запятую, например:
 *   ALLOWED_ORIGINS="https://a-nards.vercel.app,http://localhost:5173"
 * Если переменная НЕ задана — поведение как раньше ('*'), чтобы ничего не
 * сломать до настройки (это hardening, а не дыра: эндпоинты и так защищены
 * JWT-аутентификацией + RLS, а CORS ограничивает лишь чтение ответа в браузере). */
const ALLOWED_ORIGINS: string[] = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const BASE_CORS: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * CORS-заголовки для конкретного запроса. Если задан белый список — отражаем
 * Origin только когда он в списке (иначе отдаём первый разрешённый, и браузер
 * чужого origin заблокирует чтение). Пустой список → '*' (обратная совместимость).
 */
export function corsHeaders(req?: Request): Record<string, string> {
  if (ALLOWED_ORIGINS.length === 0) {
    return { ...BASE_CORS, 'Access-Control-Allow-Origin': '*' };
  }
  const origin = req?.headers.get('Origin') ?? '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { ...BASE_CORS, 'Access-Control-Allow-Origin': allow, 'Vary': 'Origin' };
}

/** Обратная совместимость: статические заголовки (без учёта Origin запроса). */
export const cors: Record<string, string> = corsHeaders();

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

export function errToResponse(e: unknown, req?: Request): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status, req);
  const msg = e instanceof Error ? e.message : 'Внутренняя ошибка';
  return json({ error: msg }, 500, req);
}

const URL = () => Deno.env.get('SUPABASE_URL')!;

/** Сервисный клиент (обходит RLS) — авторитетные записи состояния партии. */
export function admin(): SupabaseClient {
  return createClient(URL(), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Идентификация вызывающего по его JWT. */
export async function requireUser(req: Request) {
  const authz = req.headers.get('Authorization') ?? '';
  const token = authz.replace('Bearer ', '').trim();
  if (!token) throw new HttpError(401, 'Не авторизован');
  const sb = createClient(URL(), Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authz } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Не авторизован');
  return data.user;
}

/**
 * Криптостойкий ГСЧ для честного серверного броска. В отличие от прежнего
 * детерминированного mulberry32(seed+ply), результат НЕ предсказуем клиентом:
 * seed партии больше не определяет будущие броски, поэтому даже если он виден
 * в строке games — по нему ничего вычислить нельзя (аудит H2).
 * Возвращает число в [0, 1). crypto — глобальный WebCrypto в Deno.
 */
export function secureRng(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}
