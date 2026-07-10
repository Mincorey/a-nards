/* =============================================================================
 * Footer.tsx — общий подвал сайта: дублирует основные пункты меню (чтобы
 * пользователь не терялся, если пролистал страницу вниз), ссылки на
 * страницы «Политика конфиденциальности» / «Условия пользования» / «Контакты»
 * и короткую подпись бренда.
 * Переход по пунктам меню здесь уважает тот же navGuard, что и верхнее меню
 * (см. App.tsx) — если сейчас идёт активная партия, сначала спросим
 * подтверждение, а не уведём со страницы молча.
 * ========================================================================== */
import { Link } from 'react-router-dom';
import type { MouseEvent } from 'react';

export interface FooterNavItem {
  to: string;
  label: string;
}

export interface FooterProps {
  nav: FooterNavItem[];
  onNavClick: (e: MouseEvent, to: string) => void;
}

const LEGAL: FooterNavItem[] = [
  { to: '/privacy', label: 'Политика конфиденциальности' },
  { to: '/terms', label: 'Условия пользования' },
  { to: '/contacts', label: 'Контакты' },
];

export default function Footer({ nav, onNavClick }: FooterProps) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <nav className="site-footer__col">
          <span className="site-footer__heading">Разделы</span>
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className="site-footer__link" onClick={(e) => onNavClick(e, n.to)}>
              {n.label}
            </Link>
          ))}
        </nav>

        <nav className="site-footer__col">
          <span className="site-footer__heading">Информация</span>
          {LEGAL.map((n) => (
            <Link key={n.to} to={n.to} className="site-footer__link">
              {n.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="site-footer__bottom">
        <span className="site-footer__brand">A‑NARDS | Нарды | Республика Абхазия</span>
      </div>
    </footer>
  );
}
