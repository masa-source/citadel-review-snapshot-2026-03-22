/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_KEY_ADMIN?: string;
  readonly VITE_SCOUT_URL?: string;
  readonly VITE_SENTRY_DSN_ADMIN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
