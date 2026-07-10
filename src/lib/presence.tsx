/* =============================================================================
 * presence.tsx — Онлайн-статус игроков через Supabase Realtime Presence.
 * Текущий пользователь «отмечается» в общем канале; остальные видят набор
 * онлайн-идентификаторов.
 * ========================================================================== */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

interface PresenceValue {
  onlineIds: Set<string>;
  isOnline: (id: string | null | undefined) => boolean;
}

const PresenceContext = createContext<PresenceValue>({ onlineIds: new Set(), isOnline: () => false });

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { setOnlineIds(new Set()); return; }
    const channel = supabase.channel('online-users', {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const st = channel.presenceState();
        setOnlineIds(new Set(Object.keys(st)));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ user_id: user.id, online_at: new Date().toISOString() });
        }
      });

    return () => { void supabase.removeChannel(channel); };
  }, [user]);

  const value = useMemo<PresenceValue>(
    () => ({ onlineIds, isOnline: (id) => (id ? onlineIds.has(id) : false) }),
    [onlineIds],
  );
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOnline(): PresenceValue {
  return useContext(PresenceContext);
}
