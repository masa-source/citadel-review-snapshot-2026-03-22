import { useCallback, useState } from "react";
import type { DatabaseSchema, Report } from "@citadel/types";
import { apiClient } from "@/utils/apiClient";
import { clearTransactionalData } from "@/utils/dbExport";
import { deleteReport } from "@/services/report";
import {
  buildUploadPayload,
  buildUploadPayloadFromData,
  uploadWithChunkSession,
  type UploadPayload,
} from "@/services/manage/uploadService";
import { useSyncWorker } from "@/hooks/useSyncWorker";
import { useAsyncTask } from "@/hooks/useAsyncTask";

export interface DeletedOnServerDialog {
  reportIds: string[];
  reportTitles: string[];
  payload: DatabaseSchema;
  mission?: import("@citadel/types").MissionMeta;
}

export interface UploadConflictDialog {
  overlappingIds: string[];
  reportTitles: string[];
  payload: UploadPayload;
}

export interface UseUploadResult {
  isUploading: boolean;
  /** エクスポート処理の進捗（0～100）。Worker 利用時のみセットされる。 */
  uploadProgress: number | null;
  uploadSuccess: string | null;
  uploadError: string | null;
  deletedOnServerDialog: DeletedOnServerDialog | null;
  uploadConflictDialog: UploadConflictDialog | null;
  handleUpload: () => Promise<void>;
  handleDeletedOnServerReRegister: () => Promise<void>;
  handleUploadConflictOverwrite: () => Promise<void>;
  handleUploadConflictCopy: () => Promise<void>;
  handleDeletedOnServerDiscard: () => Promise<void>;
  handleDeletedOnServerCancel: () => void;
  /** ID重複ダイアログを閉じる（上書き/新規選択せずキャンセル） */
  handleUploadConflictCancel: () => void;
}

const PURGED_MESSAGE = "この端末は利用停止されました。退避データを生成して初期化してください。";
const SUCCESS_CLEAR_MESSAGE =
  "サーバーへの送信が完了し、レポートデータを削除しました。マスタデータは保持されています。";
const SUCCESS_KEEP_MESSAGE = "サーバーへの送信が完了しました。データは端末に残っています。";

export function useUpload(options?: {
  /** アップロード成功後のデータ削除確認。true 返却で削除を実行、false で持保゚。 */
  onConfirmClear?: () => Promise<boolean>;
}): UseUploadResult {
  const { onConfirmClear } = options ?? {};
  const syncWorker = useSyncWorker();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletedOnServerDialog, setDeletedOnServerDialog] = useState<DeletedOnServerDialog | null>(
    null
  );
  const [uploadConflictDialog, setUploadConflictDialog] = useState<UploadConflictDialog | null>(
    null
  );

  const uploadTask = useAsyncTask<number>({
    networkErrorMessage: "サーバーに接続できませんでした。ネットワーク接続を確認してください。",
    enableNetworkStore: true,
    externalSetters: {
      setPending: setIsUploading,
      setProgress: setUploadProgress,
      setSuccess: setUploadSuccess,
      setError: setUploadError,
    },
  });

  const performUpload = useCallback(
    async (payload: UploadPayload, mode: "copy" | "overwrite" = "copy") => {
      const result = await uploadWithChunkSession(payload, 3, mode);
      if (result.ok) {
        const shouldClear = onConfirmClear ? await onConfirmClear() : false;
        if (shouldClear) {
          await clearTransactionalData();
          setUploadSuccess(SUCCESS_CLEAR_MESSAGE);
        } else {
          setUploadSuccess(SUCCESS_KEEP_MESSAGE);
        }
        return;
      }
      if ("purged" in result && result.purged) {
        setUploadError(PURGED_MESSAGE);
        return;
      }
      if ("errorMessage" in result) {
        setUploadError(result.errorMessage);
      }
    },
    [onConfirmClear]
  );

  const handleUpload = useCallback(async () => {
    setDeletedOnServerDialog(null);
    uploadTask.setSuccess(null);
    uploadTask.setError(null);
    uploadTask.setProgress(null);

    await uploadTask.execute(async () => {
      let payload: UploadPayload;
      if (syncWorker.isReady) {
        const data = await syncWorker.runCommand({ type: "EXPORT_DATABASE" }, (p) =>
          uploadTask.setProgress(p)
        );
        if (data == null) throw new Error("Export did not return data");
        payload = await buildUploadPayloadFromData(data);
      } else {
        payload = await buildUploadPayload();
      }
      uploadTask.setProgress(null);
      const payloadReportIds = (payload.reports || [])
        .map((r: Report) => r.id)
        .filter((id): id is string => id != null);

      if (payloadReportIds.length === 0) {
        await performUpload(payload);
        return;
      }

      const reportsRes = await apiClient.GET("/api/reports");
      if (reportsRes.error || !reportsRes.data) {
        await performUpload(payload);
        return;
      }
      const serverReports = Array.isArray(reportsRes.data)
        ? (reportsRes.data as { id?: string | null }[])
        : [];
      const serverReportIds = new Set(
        serverReports.map((r) => r.id).filter((id): id is string => id != null)
      );
      const deletedOnServer = payloadReportIds.filter((id) => !serverReportIds.has(id));

      if (deletedOnServer.length > 0) {
        const reportTitles = deletedOnServer.map((id) => {
          const r = (payload.reports || []).find((x: Report) => x.id === id) as
            | { reportTitle?: string; controlNumber?: string }
            | undefined;
          return r?.reportTitle || r?.controlNumber || id;
        });
        setDeletedOnServerDialog({
          reportIds: deletedOnServer,
          reportTitles,
          payload,
          mission: payload._mission,
        });
        return;
      }

      const overlappingIds = payloadReportIds.filter((id) => serverReportIds.has(id));
      if (overlappingIds.length > 0) {
        const reportTitles = overlappingIds.map((id) => {
          const r = (payload.reports || []).find((x: Report) => x.id === id) as
            | { reportTitle?: string; controlNumber?: string }
            | undefined;
          return r?.reportTitle || r?.controlNumber || id;
        });
        setUploadConflictDialog({
          overlappingIds,
          reportTitles,
          payload,
        });
        return;
      }

      await performUpload(payload);
    });
  }, [performUpload, syncWorker, uploadTask]);

  const handleDeletedOnServerReRegister = useCallback(async () => {
    if (!deletedOnServerDialog) return;
    const payload: UploadPayload = {
      ...deletedOnServerDialog.payload,
      _mission: deletedOnServerDialog.mission,
    };
    setDeletedOnServerDialog(null);
    uploadTask.setError(null);
    uploadTask.setSuccess(null);
    await uploadTask.execute(async () => {
      await performUpload(payload);
    });
  }, [deletedOnServerDialog, performUpload, uploadTask]);

  const handleUploadConflictOverwrite = useCallback(async () => {
    if (!uploadConflictDialog) return;
    const { payload } = uploadConflictDialog;
    setUploadConflictDialog(null);
    uploadTask.setError(null);
    uploadTask.setSuccess(null);
    await uploadTask.execute(async () => {
      await performUpload(payload, "overwrite");
    });
  }, [uploadConflictDialog, performUpload, uploadTask]);

  const handleUploadConflictCopy = useCallback(async () => {
    if (!uploadConflictDialog) return;
    const { payload } = uploadConflictDialog;
    setUploadConflictDialog(null);
    uploadTask.setError(null);
    uploadTask.setSuccess(null);
    await uploadTask.execute(async () => {
      await performUpload(payload, "copy");
    });
  }, [uploadConflictDialog, performUpload, uploadTask]);

  const handleDeletedOnServerDiscard = useCallback(async () => {
    if (!deletedOnServerDialog) return;
    const { reportIds } = deletedOnServerDialog;
    setDeletedOnServerDialog(null);
    uploadTask.setError(null);
    uploadTask.setSuccess(null);
    await uploadTask.execute(async () => {
      for (const id of reportIds) {
        await deleteReport(id);
      }
      const newPayload = await buildUploadPayload();
      await performUpload(newPayload);
    });
  }, [deletedOnServerDialog, performUpload, uploadTask]);

  const handleDeletedOnServerCancel = useCallback(() => {
    setDeletedOnServerDialog(null);
  }, []);

  const handleUploadConflictCancel = useCallback(() => {
    setUploadConflictDialog(null);
  }, []);

  return {
    isUploading,
    uploadProgress,
    uploadSuccess,
    uploadError,
    deletedOnServerDialog,
    uploadConflictDialog,
    handleUpload,
    handleDeletedOnServerReRegister,
    handleUploadConflictOverwrite,
    handleUploadConflictCopy,
    handleDeletedOnServerDiscard,
    handleDeletedOnServerCancel,
    handleUploadConflictCancel,
  };
}
