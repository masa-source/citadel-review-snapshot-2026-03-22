/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_KEY_SCOUT?: string;
  readonly VITE_SCOUT_VERSION?: string;
  readonly VITE_SENTRY_DSN_SCOUT?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
