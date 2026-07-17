/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Уникальный ID текущей сборки, зашивается через define в vite.config.ts. */
declare const __BUILD_ID__: string;
