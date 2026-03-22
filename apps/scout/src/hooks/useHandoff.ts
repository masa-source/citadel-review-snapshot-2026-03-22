import { useCallback, useEffect, useRef } from "react";

/** 同一チケットの二重 GET 防止（sessionStorage: 同一タブ、localStorage: bfcache 復元タブ等をまたいで共有） */
const HANDOFF_ATTEMPTED_KEY = "citadel_handoff_attempted_ticket";
const HANDOFF_ATTEMPTED_LIST_KEY = "citadel_handoff_attempted_list";
const MAX_ATTEMPTED_LIST = 50;
import { runHandoff, normalizeHandoffError } from "@/services/manage/handoffService";
import { resetDatabaseWithConfirm } from "@/db/db";
import { useAsyncTask } from "@/hooks/useAsyncTask";

export interface UseHandoffSetters {
  setHandoffStatus: (v: string | null) => void;
  setImportProgress: (v: string | null) => void;
  setImportSuccess: (v: string | null) => void;
  setImportError: (v: string | null) => void;
  setIsImporting: (v: boolean) => void;
}

export interface UseHandoffOptions extends UseHandoffSetters {
  /** React Router の useSearchParams() が返す URLSearchParams 互換 */
  searchParams: URLSearchParams;
  isOnline: boolean;
  /** URL クリーン後に呼ぶ（例: navigate("/manage", { replace: true })） */
  onComplete?: () => void;
  /** スキーマエラー時に DB リセットを促す処理（未指定時は resetDatabaseWithConfirm） */
  onRequestReset?: () => void;
}

export interface UseHandoffResult {
  processHandoff: (ticketId: string, shouldClear: boolean) => Promise<void>;
}

/**
 * Direct Handoff の実行と URL 監視。状態は呼び出し元の setState で更新する（ファイルインポートと共通表示のため）。
 */
export function useHandoff({
  searchParams,
  isOnline,
  onComplete,
  onRequestReset = resetDatabaseWithConfirm,
  setHandoffStatus,
  setImportProgress,
  setImportSuccess,
  setImportError,
  setIsImporting,
}: UseHandoffOptions): UseHandoffResult {
  const handoffProcessedRef = useRef(false);

  const handoffTask = useAsyncTask<string>({
    externalSetters: {
      setPending: setIsImporting,
      setProgress: setImportProgress,
      setSuccess: setImportSuccess,
      setError: setImportError,
    },
  });

  const processHandoff = useCallback(
    async (ticketId: string, shouldClear: boolean) => {
      setHandoffStatus("Adminからデータを受信中...");
      handoffTask.setError(null);
      handoffTask.setSuccess(null);
      handoffTask.setProgress(null);

      await handoffTask.execute(async () => {
        try {
          const result = await runHandoff(ticketId, shouldClear, {
            onProgress: (v) => handoffTask.setProgress(v),
          });

          if (result.ok) {
            handoffTask.setSuccess(result.message);
          } else {
            handoffTask.setError(result.errorMessage);
            if (result.requestReset) {
              setTimeout(() => onRequestReset(), 100);
            }
          }
        } catch (e) {
          const { errorMessage, requestReset } = normalizeHandoffError(e);
          handoffTask.setError(errorMessage);
          if (requestReset) {
            setTimeout(() => onRequestReset(), 100);
          }
        } finally {
          handoffTask.setProgress(null);
          setHandoffStatus(null);
        }
      });
    },
    [handoffTask, onRequestReset, setHandoffStatus]
  );

  // URL に ticket があるとき、オンラインなら一度だけ processHandoff を実行
  // sessionStorage で同一チケットの二重実行を防止（リマウント時や Strict Mode でも 1 回だけ GET する）
  useEffect(() => {
    const ticketId = searchParams.get("ticket");
    const shouldClear = searchParams.get("clear") === "true";

    if (!ticketId || handoffProcessedRef.current) return;
    if (!isOnline) return;

    // 既にこのチケットで試行済みなら API を叩かず URL だけクリア（404 ループ・bfcache 復元タブ対策）
    try {
      const inSession =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(HANDOFF_ATTEMPTED_KEY) === ticketId;
      let inLocal = false;
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(HANDOFF_ATTEMPTED_LIST_KEY);
        const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
        inLocal = list.includes(ticketId);
      }
      if (inSession || inLocal) {
        onComplete?.();
        return;
      }
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(HANDOFF_ATTEMPTED_KEY, ticketId);
      }
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(HANDOFF_ATTEMPTED_LIST_KEY);
        const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
        const next = [ticketId, ...list].slice(0, MAX_ATTEMPTED_LIST);
        localStorage.setItem(HANDOFF_ATTEMPTED_LIST_KEY, JSON.stringify(next));
      }
    } catch {
      // storage が使えない環境ではスキップ
    }

    handoffProcessedRef.current = true;
    processHandoff(ticketId, shouldClear).finally(() => {
      // キーは削除しない。同じ ticket でリマウントされても二重 GET しないため。
      onComplete?.();
    });
  }, [searchParams, isOnline, processHandoff, onComplete]);

  return { processHandoff };
}
