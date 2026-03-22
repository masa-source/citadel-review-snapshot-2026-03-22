import { useCallback, useState } from "react";
import {
  fetchDelta,
  fetchFull,
  fetchAndMergeDeltaStream,
  fetchAndMergeFullStream,
} from "@/services/manage/syncService";
import { useSyncWorker } from "@/hooks/useSyncWorker";
import { useAsyncTask } from "@/hooks/useAsyncTask";

const LAST_SYNC_TIME_KEY = "lastSyncTime";

export interface UseSyncDownloadResult {
  lastSyncTime: string | null;
  isDeltaSyncing: boolean;
  /** マージ処理の進捗（0～100）。Worker 利用時のみセットされる。 */
  deltaSyncProgress: number | null;
  deltaSyncSuccess: string | null;
  deltaSyncError: string | null;
  handleDeltaSync: (includeMaster?: boolean) => Promise<void>;
  handleFullSync: () => Promise<void>;
}

export function useSyncDownload(): UseSyncDownloadResult {
  const syncWorker = useSyncWorker();
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(LAST_SYNC_TIME_KEY);
  });
  const deltaTask = useAsyncTask<number>({
    defaultErrorMessage: "差分同期に失敗しました。",
    networkErrorMessage: "サーバーに接続できませんでした。ネットワーク接続を確認してください。",
    enableNetworkStore: true,
  });

  const handleDeltaSync = useCallback(
    async (includeMaster = false) => {
      await deltaTask.execute(async () => {
        const since = lastSyncTime || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        if (syncWorker.isReady) {
          const data = await fetchDelta(since, includeMaster);
          await syncWorker.runCommand(
            {
              type: "MERGE_INTO_DB",
              payload: { data, clearFirst: false },
            },
            (p) => deltaTask.setProgress(p)
          );
          const syncedAt = data._meta?.syncedAt ?? new Date().toISOString();
          localStorage.setItem(LAST_SYNC_TIME_KEY, syncedAt);
          setLastSyncTime(syncedAt);
          const reportCount = data._meta?.reportCount ?? 0;
          deltaTask.setSuccess(
            `差分同期が完了しました。${reportCount}件のレポートを取得しました。`
          );
        } else {
          const meta = await fetchAndMergeDeltaStream(since, includeMaster);
          const syncedAt = meta.syncedAt ?? new Date().toISOString();
          localStorage.setItem(LAST_SYNC_TIME_KEY, syncedAt);
          setLastSyncTime(syncedAt);
          const reportCount = meta.reportCount ?? 0;
          deltaTask.setSuccess(
            `差分同期が完了しました。${reportCount}件のレポートを取得しました。`
          );
        }
      });
    },
    [deltaTask, lastSyncTime, syncWorker]
  );

  const handleFullSync = useCallback(async () => {
    await deltaTask.execute(
      async () => {
        if (syncWorker.isReady) {
          const data = await fetchFull();
          await syncWorker.runCommand(
            {
              type: "MERGE_INTO_DB",
              payload: { data, clearFirst: true },
            },
            (p) => deltaTask.setProgress(p)
          );
        } else {
          await fetchAndMergeFullStream();
        }
        const syncedAt = new Date().toISOString();
        localStorage.setItem(LAST_SYNC_TIME_KEY, syncedAt);
        setLastSyncTime(syncedAt);
        deltaTask.setSuccess("フル同期が完了しました。");
      },
      {
        defaultErrorMessage: "フル同期に失敗しました。",
      }
    );
  }, [deltaTask, syncWorker]);

  return {
    lastSyncTime,
    isDeltaSyncing: deltaTask.isPending,
    deltaSyncProgress: deltaTask.progress,
    deltaSyncSuccess: deltaTask.success,
    deltaSyncError: deltaTask.error,
    handleDeltaSync,
    handleFullSync,
  };
}
