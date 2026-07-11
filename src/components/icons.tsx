/* =============================================================================
 * icons.tsx — маленькие строгие контурные SVG-иконки (в стиле Material-U:
 * тонкий stroke, currentColor, без заливки) взамен цветных emoji, которые
 * раньше стояли в UI (🎲🎯🤖🧑‍🤝‍🧑🔔✎ и т.п.) — они выглядели «дёшево» и
 * рендерились по-разному в зависимости от ОС/шрифта. currentColor означает,
 * что иконка всегда наследует цвет окружающего текста — отдельно красить не
 * нужно. Размер по умолчанию — 1em (аккуратно вписывается в высоту строки).
 * ========================================================================== */
import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

const base: IconProps = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

/** Игральная кость — вид нард / «бросить кубики» / «начать игру». */
export function IconDice(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.2" cy="8.2" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="8.2" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="8.2" cy="15.8" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="15.8" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Робот — сложность бота. */
export function IconRobot(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="9" width="16" height="11" rx="3" />
      <path d="M12 9V5.5" />
      <circle cx="12" cy="4" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9 18h6" />
      <path d="M2 13v3" />
      <path d="M22 13v3" />
    </svg>
  );
}

/** Двое людей — выбор соперника (открытый стол / позвать друга). */
export function IconUsers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8.5" cy="8" r="2.6" />
      <path d="M3 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="16.5" cy="8.5" r="2.1" />
      <path d="M15 14.2c2.7.3 4.6 2.1 4.6 4.8" />
    </svg>
  );
}

/** Колокольчик — уведомления. */
export function IconBell(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

/** Карандаш — сменить аватар / редактировать. */
export function IconPencil(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20l.9-3.9L16.6 4.4a1.5 1.5 0 0 1 2.1 0l.9.9a1.5 1.5 0 0 1 0 2.1L7.9 19.1 4 20Z" />
      <path d="M14.5 6.5l3 3" />
    </svg>
  );
}

/** Речевое облачко — чат/сообщения. */
export function IconChat(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V16H5.5A1.5 1.5 0 0 1 4 14.5Z" />
    </svg>
  );
}

/** Шеврон вниз — раскрытие выпадающего списка. */
export function IconChevron(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Выход из партии — дверь со стрелкой (строгий контур). */
export function IconExit(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 4h3.5A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M10 12h9" />
      <path d="M16 9l3 3-3 3" />
    </svg>
  );
}

/** Шестерёнка — настройки игры (строгий контур). */
export function IconGear(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
