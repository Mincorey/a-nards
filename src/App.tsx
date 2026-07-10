import { useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import PlayPage from './pages/PlayPage';
import LobbyPage from './pages/LobbyPage';
import TablePage from './pages/TablePage';
import ProfilePage from './pages/ProfilePage';
import FriendsPage from './pages/FriendsPage';
import AuthPage from './pages/AuthPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import ContactsPage from './pages/ContactsPage';
import NotFoundPage from './pages/NotFoundPage';
import ProfileMenu from './components/ProfileMenu';
import HeaderToggle from './components/HeaderToggle';
import Footer from './components/Footer';
import ConfirmModal from './components/ConfirmModal';
import { useAuth } from './lib/auth';
import { useNavGuardRef } from './lib/navGuard';

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const guard = useNavGuardRef();
  // Пункт меню, на который пользователь кликнул во время активной партии —
  // ждём подтверждения вместо мгновенного перехода (см. lib/navGuard.tsx).
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  // hideMobile — пункт скрывается ТОЛЬКО в мобильной версии (класс .hide-mobile,
  // см. media max-width:560px в CSS). На мобильном в навбаре остаётся лишь «Вход»
  // (если не залогинен) либо ник профиля (ProfileMenu). Остальные разделы
  // доступны с главной страницы. В футере (тот же массив) hideMobile не влияет.
  const nav: { to: string; label: string; hideMobile?: boolean }[] = [
    { to: '/', label: 'Главная', hideMobile: true },
    { to: '/play', label: 'Игра с ботом', hideMobile: true },
    { to: '/lobby', label: 'Игра онлайн', hideMobile: true },
    ...(user ? [] : [{ to: '/auth', label: 'Вход' }]),
  ];

  function onNavClick(e: React.MouseEvent, to: string) {
    if (to === pathname) return;
    if (guard.active.current) {
      e.preventDefault();
      setPendingTo(to);
    }
  }

  function confirmLeave() {
    const to = pendingTo;
    setPendingTo(null);
    guard.onLeave.current?.();
    if (to) navigate(to);
  }

  return (
    <div className="app">
      <HeaderToggle>
        <Link to="/" className="app__logo" onClick={(e) => onNavClick(e, '/')}>A‑NARDS</Link>
        <nav className="app__nav">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={(e) => onNavClick(e, n.to)}
              className={
                'app__nav-link'
                + (pathname === n.to ? ' is-active' : '')
                + (n.hideMobile ? ' hide-mobile' : '')
              }
            >
              {n.label}
            </Link>
          ))}
        </nav>
        {user && <ProfileMenu />}
      </HeaderToggle>
      <main className="app__main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/lobby" element={<LobbyPage />} />
          <Route path="/table/:id" element={<TablePage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <Footer nav={nav} onNavClick={onNavClick} />

      <ConfirmModal
        open={pendingTo != null}
        title="Покинуть игру?"
        message="Партия ещё не завершена. Если уйти сейчас, прогресс в этой партии будет потерян."
        confirmLabel="Уйти"
        danger
        onConfirm={confirmLeave}
        onCancel={() => setPendingTo(null)}
      />
    </div>
  );
}
