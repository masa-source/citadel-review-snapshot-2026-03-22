/**
 * エラーレポート共通ユーティリティ
 * Sentry への送信を一元管理し、オフライン・ネットワークエラー時のノイズを抑止する。
 */

import * as Sentry from "@sentry/react";

// ========== 型定義（Scout + Admin の統合） ==========

/** エラーの機能カテゴリ（両アプリで使用する値の Union） */
export type FeatureCategory =
  | "sync"
  | "report"
  | "master"
  | "offline"
  | "indexeddb"
  | "navigation"
  | "template"
  | "export"
  | "demo"
  | "api"
  | "unknown";

/** エラーのユーザーアクション（両アプリで使用する値の Union） */
export type UserAction =
  | "save"
  | "load"
  | "delete"
  | "create"
  | "update"
  | "export"
  | "import"
  | "sync_upload"
  | "sync_download"
  | "navigate"
  | "complete"
  | "generate_pdf"
  | "generate_excel"
  | "upload_template"
  | "unknown";

/** エラーコンテキスト（AI・Sentry と共有しやすい構造） */
export interface ErrorContext {
  feature: FeatureCategory;
  action: UserAction;
  reportId?: string;
  isOnline?: boolean;
  additionalInfo?: Record<string, unknown>;
}

// ========== ネットワークエラー判定 ==========

/** ネットワークエラーとして無視するメッセージパターン（beforeSend 等で利用） */
export const NETWORK_ERROR_PATTERNS = [
  "Failed to fetch",
  "NetworkError",
  "Load failed",
  "ERR_NAME_NOT_RESOLVED",
  "ERR_INTERNET_DISCONNECTED",
  "ERR_NETWORK",
] as const;

/**
 * ネットワーク・オフライン起因のエラーかどうかを判定する。
 * Sentry 送信スキップや UI フォールバックの判定に利用する。
 */
export function isNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message ?? "";
  return (
    (e.name === "TypeError" && (msg.includes("fetch") || msg.includes("Fetch"))) ||
    NETWORK_ERROR_PATTERNS.some((p) => msg.includes(p))
  );
}

// ========== beforeSend フィルタ ==========

export interface BeforeSendFilterOptions {
  /** オフライン時は送信しない（default: true） */
  skipOffline?: boolean;
  /** ネットワークエラーメッセージの場合は送信しない（default: true） */
  skipNetworkErrors?: boolean;
  /** 開発環境でコンソールに出力（default: true） */
  devConsole?: boolean;
}

/**
 * Sentry の beforeSend で利用するフィルタ関数を生成する。
 * オフライン時およびネットワーク系エラーを送信対象から除外する。
 */
export function createBeforeSendFilter(
  options: BeforeSendFilterOptions = {}
): (event: Sentry.Event, hint: Sentry.EventHint) => Sentry.Event | null {
  const { skipOffline = true, skipNetworkErrors = true, devConsole = true } = options;

  return (event: Sentry.Event, hint: Sentry.EventHint): Sentry.Event | null => {
    if (skipOffline && typeof navigator !== "undefined" && !navigator.onLine) {
      return null;
    }

    if (devConsole && process.env.NODE_ENV === "development") {
      console.error("[Sentry]", hint.originalException ?? event.message);
    }

    if (skipNetworkErrors) {
      const error = hint.originalException as Error | undefined;
      const message = error?.message ?? event.message ?? "";
      if (NETWORK_ERROR_PATTERNS.some((p) => String(message).includes(p))) {
        return null;
      }
    }

    return event;
  };
}

// ========== オンライン状態の取得（クライアントのみ） ==========

function getIsOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

// ========== コア API ==========

/**
 * エラーを1箇所で報告するユーティリティ。
 * 各所の try/catch ではこの関数を呼び、UI 表示は呼び出し元で行う。
 */
export function reportError(
  error: Error | unknown,
  context?: Partial<ErrorContext>
): string | undefined {
  return captureError(error, {
    feature: "unknown",
    action: "unknown",
    ...context,
  });
}

/**
 * 構造化されたエラーを Sentry に送信。
 * オフライン時およびネットワークエラーと判定した場合は送信しない。
 */
function captureError(error: Error | unknown, context: ErrorContext): string | undefined {
  const isOnline = context.isOnline ?? getIsOnline();

  if (!isOnline) {
    return undefined;
  }

  if (isNetworkError(error)) {
    return undefined;
  }

  const eventId = Sentry.captureException(error, {
    tags: {
      feature: context.feature,
      action: context.action,
      is_online: String(isOnline),
    },
    extra: {
      reportId: context.reportId,
      ...context.additionalInfo,
    },
    fingerprint: [context.feature, context.action, "{{ default }}"],
  });

  if (process.env.NODE_ENV === "development") {
    console.error("[ErrorReporting]", { error, context, eventId });
  }

  return eventId;
}

// ========== Sentry 初期化ユーティリティ ==========

/** アプリ識別子 */
export type CitadelApp = "admin" | "scout";

/** 実行プラットフォーム */
export type CitadelPlatform = "web" | "pwa" | "server";

/** initCitadelSentry に渡す設定 */
export interface CitadelSentryConfig {
  /** Sentry DSN。未設定（undefined / 空文字）の場合は初期化をスキップする。 */
  dsn: string | undefined;
  /** アプリ識別子（Sentry の tag: app に設定される） */
  app: CitadelApp;
  /** 実行プラットフォーム（Sentry の tag: platform に設定される） */
  platform: CitadelPlatform;
  /**
   * 本番環境かどうかの判定。
   * デフォルト: `process.env.NODE_ENV === "production"`
   */
  isProduction?: boolean;
  /** Sentry の environment（未指定時は "development"） */
  environment?: string;
}

/**
 * Citadel 標準の Sentry 初期化。
 * DSN が未設定の場合はスキップ（開発環境でのオプトアウト対応）。
 * platform: "server" の場合は beforeSend / beforeBreadcrumb を省略する。
 */
export function initCitadelSentry(config: CitadelSentryConfig): void {
  const {
    dsn,
    app,
    platform,
    isProduction = process.env.NODE_ENV === "production",
    environment,
  } = config;

  if (!dsn) return;

  // Sentry.init に渡すオプションを型付きで構築する
  const options: Parameters<typeof Sentry.init>[0] = {
    dsn,
    environment: environment ?? "development",
    tracesSampleRate: isProduction ? 0.1 : 1.0,
    debug: false,
    initialScope: {
      tags: { app, platform },
    },
  };

  // クライアント専用オプション（サーバーサイドでは不要）
  if (platform !== "server") {
    // replay 系は BrowserOptions 専用プロパティのため型アサーションを使う
    (options as Record<string, unknown>)["replaysSessionSampleRate"] = 0;
    (options as Record<string, unknown>)["replaysOnErrorSampleRate"] = isProduction ? 1.0 : 0;
    options.beforeSend = createBeforeSendFilter({
      skipOffline: true,
      skipNetworkErrors: true,
      devConsole: true,
    }) as Parameters<typeof Sentry.init>[0]["beforeSend"];
    options.beforeBreadcrumb = (breadcrumb) => {
      if (breadcrumb.category === "console" && breadcrumb.message?.includes("password")) {
        return null;
      }
      return breadcrumb;
    };
  }

  Sentry.init(options);
}
