import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Не роняем приложение — даём понятную подсказку в консоль.
  console.warn(
    '[A-NARDS] Не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Скопируйте .env.example в .env.local и заполните.',
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const isSupabaseConfigured = Boolean(url && anonKey);
