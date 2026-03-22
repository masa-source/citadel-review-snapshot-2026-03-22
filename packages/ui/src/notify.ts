/**
 * ユーザー通知の共通実装。
 * sonner の toast で UI 表示し、エラー時は @citadel/monitoring で Sentry に送信する。
 * Admin・Scout 双方がこのモジュールを re-export して使用する。
 */

import { toast } from "sonner";
import { reportError, type ErrorContext } from "@citadel/monitoring";

export const notify = {
  success(message: string): void {
    toast.success(message);
  },

  error(message: string, error?: unknown, context?: Partial<ErrorContext>): void {
    toast.error(message);
    if (error != null) {
      reportError(error, { feature: "master", action: "unknown", ...context });
    }
  },

  info(message: string): void {
    toast.info(message);
  },
};
