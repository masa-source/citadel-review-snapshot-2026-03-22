/**
 * API エラー応答の code に使う定数。
 * バックエンドの HTTPException detail.code とフロントの条件分岐で共通利用する。
 * バックエンドは apps/backend/error_codes.py の値と一致させること。
 */
export const ErrorCodes = {
  /** 任務が除名済み/期限切れ（403） */
  PURGED: "PURGED",
  /** テンプレートファイルが外部で変更された（409） */
  FILE_MODIFIED_EXTERNALLY: "FILE_MODIFIED_EXTERNALLY",
  /** テンプレートファイルが別アプリで開かれている（409） */
  FILE_IN_USE: "FILE_IN_USE",
  /** バックアップ作成失敗（409） */
  BACKUP_FAILED: "BACKUP_FAILED",
  /** テンプレートファイルが見つからない（404） */
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
