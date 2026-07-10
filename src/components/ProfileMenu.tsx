/* =============================================================================
 * ProfileMenu.tsx — единое выпадающее меню по имени профиля, теперь и на
 * десктопе, и на мобильном (см. media query в CSS). Объединяет «Рейтинг»,
 * «Профиль», «Друзья», уведомления (приглашения за стол) и выход в одно меню.
 * На мобильном — выезжает СВЕРХУ экрана на пол-высоты по тапу на имя профиля
 * (крестик закрытия + полупрозрачный скрим, тап по нему тоже закрывает меню).
 * На десктопе — компактная выпадающая панель-«дропдаун», заякоренная под
 * кнопкой с именем, без скрима (см. .profile-menu__panel в CSS).
 * Раньше на десктопе «Друзья», колокол уведомлений и имя профиля были
 * отдельными элементами шапки (см. историю App.tsx) — теперь всё здесь.
 * Данные о заявках/инвайтах берутся из общего SocialNotificationsProvider.
 * Переход на Профиль/Друзья тоже уважает navGuard (см. lib/navGuard.tsx) —
 * если сейчас активна партия, сперва спрашиваем подтверждение.
 * ========================================================================== */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { acceptInvite, declineInvite, type InviteRow } from '../lib/friends';
import { useSocialNotifications } from '../lib/socialNotifications';
import { useNavGuardRef } from '../lib/navGuard';
import ConfirmModal from './ConfirmModal';
import { useOverlay } from '../game/pause';

export default function ProfileMenu() {
  const auth = useAuth();
  const nav = useNavigate();
  const guard = useNavGuardRef();
  const { requests, invites, reload } = useSocialNotifications();
  const [open, setOpen] = useState(false);
  useOverlay(open); // пауза партии с ботом, пока открыто меню профиля
  const [confirmOut, setConfirmOut] = useState(false);
  const [pendingTo, setPendingTo] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Esc тоже закрывает — как и у обычных модалок в приложении.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!auth.user) return null;
  const total = requests + invites.length;
  const label = auth.profile?.display_name || 'Профиль';

  async function onAccept(inv: InviteRow) {
    try {
      const tableId = await acceptInvite(inv);
      setOpen(false);
      nav(`/table/${tableId}`);
    } catch { /* стол мог закрыться — игнорируем */ }
  }

  function goTo(to: string) {
    setOpen(false);
    if (guard.active.current) { setPendingTo(to); return; }
    nav(to);
  }

  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className="app__nav-link profile-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {label}
        {total > 0 && <span className="profile-menu__badge">{total}</span>}
      </button>

      {open && (
        <>
          <div className="profile-menu__scrim" onClick={() => setOpen(false)} />
          <div className="profile-menu__panel">
            <div className="profile-menu__head">
              <span className="profile-menu__title">{label}</span>
              <button
                type="button"
                className="profile-menu__close"
                onClick={() => setOpen(false)}
                aria-label="Закрыть меню"
              >
                ×
              </button>
            </div>

            <button type="button" className="profile-menu__item" onClick={() => goTo('/profile')}>
              Рейтинг
            </button>
            <button type="button" className="profile-menu__item" onClick={() => goTo('/profile')}>
              Профиль
            </button>
            <button type="button" className="profile-menu__item" onClick={() => goTo('/friends')}>
              Друзья{requests > 0 && <span className="profile-menu__count">{requests}</span>}
            </button>

            <div className="profile-menu__notifs">
              <span className="profile-menu__label">Уведомления</span>
              {invites.length === 0 ? (
                <p className="profile-menu__empty">Пока пусто</p>
              ) : invites.map((inv) => (
                <div key={inv.id} className="bell__item">
                  <div className="bell__text">
                    <strong>{inv.from?.display_name ?? 'Игрок'}</strong> зовёт за стол
                    {inv.table?.name ? ` «${inv.table.name}»` : ''}
                  </div>
                  <div className="bell__actions">
                    <button type="button" className="btn btn--primary" onClick={() => onAccept(inv)}>Принять</button>
                    <button type="button" className="btn" onClick={() => declineInvite(inv.id).then(reload)}>Нет</button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="profile-menu__item profile-menu__signout"
              onClick={() => { setOpen(false); setConfirmOut(true); }}
            >
              Выйти
            </button>
          </div>
        </>
      )}

      <ConfirmModal
        open={confirmOut}
        title="Выйти из аккаунта?"
        message="Вы сможете войти снова в любой момент по email и паролю."
        confirmLabel="Выйти"
        danger
        onConfirm={() => { setConfirmOut(false); auth.signOut(); nav('/'); }}
        onCancel={() => setConfirmOut(false)}
      />

      <ConfirmModal
        open={pendingTo != null}
        title="Покинуть игру?"
        message="Партия ещё не завершена. Если уйти сейчас, прогресс в этой партии будет потерян."
        confirmLabel="Уйти"
        danger
        onConfirm={() => { const to = pendingTo; setPendingTo(null); guard.onLeave.current?.(); if (to) nav(to); }}
        onCancel={() => setPendingTo(null)}
      />
    </div>
  );
}
