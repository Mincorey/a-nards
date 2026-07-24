/* =============================================================================
 * auth.tsx — Контекст авторизации поверх Supabase Auth.
 * -----------------------------------------------------------------------------
 * AuthProvider держит сессию и профиль текущего игрока, подписывается на
 * onAuthStateChange и предоставляет операции (вход/регистрация/выход, сброс
 * пароля, обновление профиля, загрузка аватара).
 * ========================================================================== */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { compressAvatar } from './image';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  rating: number;
  games_played: number;
  games_won: number;
  /** Баланс внутриигровой валюты A-COINS. */
  coins: number;
  created_at: string;
  updated_at: string;
}

export interface SignUpResult { needsEmailConfirm: boolean; }

interface AuthContextValue {
  ready: boolean;            // первичная загрузка сессии завершена
  configured: boolean;       // заданы ли env Supabase
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  signUp: (email: string, password: string, displayName?: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'phone'>>) => Promise<void>;
  uploadAvatar: (file: File) => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const userId = session?.user?.id ?? null;
  const loadedFor = useRef<string | null>(null);

  const fetchProfile = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) { console.warn('[auth] profile load:', error.message); return; }
    setProfile((data as Profile) ?? null);
  }, []);

  // Первичная сессия + подписка на изменения.
  useEffect(() => {
    if (!isSupabaseConfigured) { setReady(true); return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  // Подгрузка/сброс профиля при смене пользователя.
  useEffect(() => {
    if (!userId) { setProfile(null); loadedFor.current = null; return; }
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;
    void fetchProfile(userId);
  }, [userId, fetchProfile]);

  const signUp = useCallback<AuthContextValue['signUp']>(async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: displayName ? { display_name: displayName } : undefined },
    });
    if (error) throw error;
    // Нет сессии → включено подтверждение email.
    return { needsEmailConfirm: !data.session };
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const sendPasswordReset = useCallback<AuthContextValue['sendPasswordReset']>(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (userId) await fetchProfile(userId);
  }, [userId, fetchProfile]);

  const updateProfile = useCallback<AuthContextValue['updateProfile']>(async (patch) => {
    if (!userId) throw new Error('Не авторизован');
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
    if (error) throw error;
    await fetchProfile(userId);
  }, [userId, fetchProfile]);

  const uploadAvatar = useCallback<AuthContextValue['uploadAvatar']>(async (file) => {
    if (!userId) throw new Error('Не авторизован');
    // Сжимаем до квадрата 512px (WebP/JPEG) — экономия места в хранилище/БД.
    const compressed = await compressAvatar(file, { maxSize: 512, quality: 0.85 });
    const ext = (compressed.type === 'image/webp' ? 'webp'
      : compressed.type === 'image/jpeg' ? 'jpg'
      : (compressed.name.split('.').pop() || 'png').toLowerCase());
    const path = `${userId}/avatar_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatars').upload(path, compressed, {
        upsert: true, cacheControl: '3600', contentType: compressed.type || undefined,
      });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = data.publicUrl;
    await updateProfile({ avatar_url: url });
    // Полностью удаляем прежние аватары пользователя (всё в его папке, кроме
    // только что загруженного файла) — чтобы в хранилище не копился мусор
    // (аудит M2). Требует узкой SELECT-политики avatars_select_own (миграция 0010).
    // Сбой очистки не критичен — не эскалируем.
    try {
      const { data: files } = await supabase.storage.from('avatars').list(userId);
      const stale = (files ?? [])
        .map((f: { name: string }) => `${userId}/${f.name}`)
        .filter((p: string) => p !== path);
      if (stale.length > 0) await supabase.storage.from('avatars').remove(stale);
    } catch {
      /* очистка старых аватаров не критична */
    }
    return url;
  }, [userId, updateProfile]);

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    configured: isSupabaseConfigured,
    session,
    user: session?.user ?? null,
    profile,
    signUp, signIn, signOut, sendPasswordReset, refreshProfile, updateProfile, uploadAvatar,
  }), [ready, session, profile, signUp, signIn, signOut, sendPasswordReset, refreshProfile, updateProfile, uploadAvatar]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри <AuthProvider>');
  return ctx;
}
