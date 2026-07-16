/* =============================================================================
 * phone.ts — «умная» маска российского телефона +7 (XXX) XXX-XX-XX.
 * formatRuPhone — форматирует ввод по мере набора (для value инпута).
 * ruPhoneToE164 — приводит к каноничному виду +7XXXXXXXXXX для хранения в БД
 * (или null, если номер введён не полностью).
 * ========================================================================== */

/** Оставляет 10 значащих цифр номера (без кода страны 7/8). */
function nationalDigits(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (d.startsWith('7')) d = d.slice(1);
  return d.slice(0, 10);
}

/** Форматирует ввод в маску +7 (XXX) XXX-XX-XX по мере набора. Пусто -> ''. */
export function formatRuPhone(input: string): string {
  const d = nationalDigits(input);
  if (d.length === 0) return '';
  let out = '+7 (' + d.slice(0, 3);
  if (d.length >= 3) out += ')';
  if (d.length > 3) out += ' ' + d.slice(3, 6);
  if (d.length > 6) out += '-' + d.slice(6, 8);
  if (d.length > 8) out += '-' + d.slice(8, 10);
  return out;
}

/** Каноничный вид +7XXXXXXXXXX для БД, либо null если номер неполный. */
export function ruPhoneToE164(input: string): string | null {
  const d = nationalDigits(input);
  return d.length === 10 ? '+7' + d : null;
}
