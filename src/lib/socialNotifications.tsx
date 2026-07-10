/* =============================================================================
 * socialNotifications.tsx — общий источник данных «заявки в друзья + инвайты
 * за стол» для колокола (десктоп) и меню профиля (мобильный). Раньше оба
 * компонента были ВСЕГДА смонтированы одновременно (просто скрыты через CSS
 * в зависимости от ширины экрана) и каждый независимо открывал Realtime-канал
 * `social:<userId>` — Supabase ругался «cannot add postgres_changes callbacks
 * ... after subscribe()», потому что канал с тем же именем уже был подписан
 * другим компонентом. Теперь подписка ровно одна, на уровне контекста.
 *
 * `version` растёт при каждом событии Realtime — компоненты, которым нужны
 * СВОИ более полные данные (например FriendsPage со списком друзей/заявок),
 * могут подписаться на изменение version через useEffect и перезагрузить
 * свои данные, не открывая ещё один Realtime-канал.
 * ========================================================================== */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { getFriends, getIncomingInvites, subscribeSocial, type InviteRow } from './friends';

interface SocialNotificationsValue {
  requests: number;
  invites: InviteRow[];
  version: number;
  reload: () => void;
}

const Ctx = createContext<SocialNotificationsValue>({ requests: 0, invites: [], version: 0, reload: () => {} });

export function SocialNotificationsProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [requests, setRequests] = useState(0);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [version, setVersion] = useState(0);
  const versionRef = useRef(0);

  const reload = useCallback(() => {
    getFriends().then((b) => setRequests(b.incoming.length)).catch(() => {});
    getIncomingInvites().then(setInvites).catch(() => {});
  }, []);

  const onChange = useCallback(() => {
    versionRef.current += 1;
    setVersion(versionRef.current);
    reload();
  }, [reload]);

  useEffect(() => {
    if (!auth.user) { setRequests(0); setInvites([]); return; }
    reload();
    return subscribeSocial(auth.user.id, onChange);
  }, [auth.user, reload, onChange]);

  return <Ctx.Provider value={{ requests, invites, version, reload }}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSocialNotifications(): SocialNotificationsValue {
  return useContext(Ctx);
}
