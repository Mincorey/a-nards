/* Валидация username профиля (совпадает с CHECK-ограничением в БД). */
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function validateUsername(name: string): { ok: boolean; error?: string } {
  const v = name.trim();
  if (v.length < 3) return { ok: false, error: 'Минимум 3 символа' };
  if (v.length > 20) return { ok: false, error: 'Максимум 20 символов' };
  if (!USERNAME_RE.test(v)) return { ok: false, error: 'Только латиница, цифры и _' };
  return { ok: true };
}

/** Процент побед (0..100), безопасно при нуле партий. */
export function winRate(played: number, won: number): number {
  if (played <= 0) return 0;
  return Math.round((won / played) * 100);
}
