import { useCallback, useEffect, useRef, useState } from "react";
import type { DatabaseSchema } from "@citadel/types";
import type { WorkerCommand, WorkerEvent } from "@/services/manage/workerProtocol";
import { isWorkerEvent } from "@/services/manage/workerProtocol";

export interface UseSyncWorkerResult {
  /** Worker が利用可能か（ブラウザかつ Worker 初期化済み） */
  isReady: boolean;
  /**
   * コマンドを送信し、完了まで待つ。onProgress で進捗（0～100）を受け取れる。
   * EXPORT_DATABASE の場合は data を返す。MERGE_INTO_DB の場合は undefined。
   */
  runCommand: (
    cmd: WorkerCommand,
    onProgress?: (progress: number, message?: string) => void
  ) => Promise<DatabaseSchema | undefined>;
}

export function useSyncWorker(): UseSyncWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const w = new Worker(new URL("../workers/sync.worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = w;
      // 状態更新を次のマイクロタスクに遅延させて cascading render を回避
      Promise.resolve().then(() => setIsReady(true));
      return () => {
        w.terminate();
        workerRef.current = null;
        setIsReady(false);
      };
    } catch {
      // Worker 作成失敗
    }
  }, []);

  const runCommand = useCallback(
    (
      cmd: WorkerCommand,
      onProgress?: (progress: number, message?: string) => void
    ): Promise<DatabaseSchema | undefined> => {
      return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
          reject(new Error("Worker is not available in this environment"));
          return;
        }

        const worker = workerRef.current;
        if (!worker) {
          reject(new Error("Worker is not ready"));
          return;
        }

        const handleMessage = (ev: MessageEvent<WorkerEvent>) => {
          const event = ev.data;
          if (!isWorkerEvent(event)) return;

          switch (event.type) {
            case "PROGRESS":
              onProgress?.(event.progress, event.message);
              break;
            case "DONE":
              cleanup();
              resolve(undefined);
              break;
            case "EXPORT_RESULT":
              cleanup();
              resolve(event.data);
              break;
            case "ERROR":
              cleanup();
              reject(new Error(event.message));
              break;
          }
        };

        const handleError = (ev: ErrorEvent) => {
          cleanup();
          const err = ev.message || ev.error?.message || "Worker error";
          reject(new Error(err));
        };

        const cleanup = () => {
          worker?.removeEventListener("message", handleMessage);
          worker?.removeEventListener("error", handleError);
        };

        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError);
        worker.postMessage(cmd);
      });
    },
    []
  );

  return { isReady, runCommand };
}
