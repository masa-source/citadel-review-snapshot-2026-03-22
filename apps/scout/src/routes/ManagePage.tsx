import { Suspense, useCallback, useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  FileJson,
  Download,
  Upload,
  Database,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Copy,
  Loader2,
  Rocket,
  RefreshCw,
  HelpCircle,
} from "lucide-react";

import { Alert, AlertTitle, AlertDescription } from "@citadel/ui";
import { OfflineUnavailableHelpDialog } from "@/components/OfflineUnavailableHelpDialog";

import { isDbResetRequired, resetDatabaseWithConfirm, resetLocalDatabase } from "@/db/db";
import { type DatabaseSchema, type MissionMeta } from "@citadel/types";
import { useHandoff } from "@/hooks/useHandoff";
import { useMissionStatus } from "@/hooks/useMissionStatus";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useManageCounts } from "@/hooks/useManageCounts";
import { useSyncDownload } from "@/hooks/useSyncDownload";
import { ConfirmDialog, useConfirmDialog } from "@citadel/ui";
import { useFileImport } from "@/hooks/useFileImport";
import { useUpload } from "@/hooks/useUpload";
import { TABLE_LABELS } from "@citadel/types";
import { TABLE_KEYS, exportDatabase } from "@/utils/dbExport";
import { notify } from "@/services/notify";
import { useNetworkErrorStore } from "@/stores/networkErrorStore";
import { sendMissionHeartbeat } from "@/services/manage/missionService";
import { getApiBaseUrl } from "@/utils/apiClient";
import { getDeviceId } from "@/utils/deviceId";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from "@citadel/ui";

/** サーバーAPI URL */

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2分毎

function ManagePageContent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const missionStatus = useMissionStatus();
  const isOnline = useOnlineStatus();
  const API_URL = getApiBaseUrl();

  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [clearBeforeImport, setClearBeforeImport] = useState(true);
  const [importAsNew, setImportAsNew] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(() => {
    return isDbResetRequired() ? "データベースの形式が古いため、リセットが必要です。" : null;
  });

  useHandoff({
    searchParams,
    isOnline,
    onComplete: () => navigate("/manage", { replace: true }),
    setHandoffStatus,
    setImportProgress,
    setImportSuccess,
    setImportError,
    setIsImporting,
  });

  const syncDownload = useSyncDownload();
  const {
    lastSyncTime,
    isDeltaSyncing,
    deltaSyncProgress,
    deltaSyncSuccess,
    deltaSyncError,
    handleDeltaSync,
    handleFullSync,
  } = syncDownload;

  const [offlineRestricted] = useState(() => {
    if (typeof window === "undefined") return false;
    return !window.isSecureContext || !("serviceWorker" in navigator);
  });
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const lastNetworkError = useNetworkErrorStore((s) => s.lastNetworkError);
  const clearNetworkError = useNetworkErrorStore((s) => s.clearNetworkError);
  useEffect(() => {
    if (lastNetworkError) {
      notify.error("サーバーに接続できませんでした。ネットワーク接続を確認してください。");
      clearNetworkError();
    }
  }, [lastNetworkError, clearNetworkError]);

  const confirmDialog = useConfirmDialog();
  const upload = useUpload({
    onConfirmClear: () =>
      confirmDialog.ask({
        title: "レポートデータの削除",
        description:
          "送信に成功しました。\n端末内のレポートデータを削除して、次回の作業に備えますか？\n（マスタデータは残ります）",
        variant: "danger",
        confirmLabel: "削除する",
        cancelLabel: "残す",
      }),
  });
  const {
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
  } = upload;

  const counts = useManageCounts({ onDbError: setDbError });

  const processImport = useFileImport({
    clearBeforeImport,
    importAsNew,
    setImportError,
    setImportSuccess,
    setImportProgress,
    setIsImporting,
  });

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".json")) {
        setImportError("JSON ファイル（.json）を選択してください。");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result;
        if (typeof text === "string") processImport(text);
        else setImportError("ファイルの読み込みに失敗しました。");
      };
      reader.onerror = () => setImportError("ファイルの読み込みに失敗しました。");
      reader.readAsText(file, "UTF-8");
    },
    [processImport]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const exportJson = useCallback(async () => {
    setImportError(null);
    setImportSuccess(null);
    try {
      const data = await exportDatabase();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "report_export.json";
      a.click();
      URL.revokeObjectURL(url);
      setImportSuccess("report_export.json をダウンロードしました。");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "エクスポート中にエラーが発生しました。");
    }
  }, []);

  const handleFinalExport = useCallback(async () => {
    try {
      const data = await exportDatabase();
      // useMissionStatus フック経由で取得（db への直接アクセスを避けるリポジトリパターン準拠）
      const mission = missionStatus.mission;
      const payload: DatabaseSchema & { _mission?: MissionMeta } = {
        ...data,
      };
      if (mission?.missionId) {
        payload._mission = {
          missionId: mission.missionId,
          permission: mission.permission ?? "View",
          issuedAt: mission.issuedAt,
          expiresAt: mission.expiresAt,
          status: "Expired",
        };
      }
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[Final Export] エラー:", e);
    }
  }, [missionStatus.mission]);

  const handleDataReset = useCallback(async () => {
    const ok = await confirmDialog.ask({
      title: "データの初期化の確認",
      description:
        "端末内のすべてのデータを削除して初期状態に戻します。\nこの操作は取り消せません。よろしいですか？",
      variant: "danger",
      confirmLabel: "実行する",
    });
    if (ok) await resetLocalDatabase();
  }, [confirmDialog]);

  // 任務 Heartbeat: オンラインかつ任務有効中のみ送信
  useEffect(() => {
    if (
      !isOnline ||
      !missionStatus.hasMission ||
      missionStatus.isExpired ||
      !missionStatus.mission?.missionId
    )
      return;
    const deviceId = getDeviceId();
    const missionId = missionStatus.mission.missionId;
    const sendHeartbeat = () => {
      void sendMissionHeartbeat(missionId, deviceId).then(({ purged }) => {
        if (purged) {
          console.warn("[Mission] 利用停止されました");
        }
      });
    };
    sendHeartbeat();
    const id = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [
    isOnline,
    missionStatus.hasMission,
    missionStatus.isExpired,
    missionStatus.mission?.missionId,
  ]);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel={confirmDialog.cancelLabel}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={confirmDialog.onCancel}
        onOpenChange={confirmDialog.onOpenChange}
      />
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">データ管理</h1>
          <Link to="/" className="text-sm text-blue-600 hover:underline">
            トップへ戻る
          </Link>
        </div>

        {/* 非セキュア環境でのオフライン機能制限警告 */}
        {offlineRestricted && (
          <Alert
            variant="warning"
            className="border-amber-300 bg-amber-50 shadow-md dark:border-amber-700 dark:bg-amber-950/40"
          >
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">
              現在の接続環境ではオフライン機能が利用できません
            </AlertTitle>
            <AlertDescription>
              <p className="mb-2 text-sm text-amber-800 dark:text-amber-200">
                HTTP や IP
                アドレスでの接続では、ブラウザのセキュリティ制限によりオフラインでの起動やキャッシュが使えません。
              </p>
              <button
                type="button"
                onClick={() => setHelpDialogOpen(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 underline hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
              >
                <HelpCircle className="h-4 w-4" />
                なぜ？解決策を見る
              </button>
            </AlertDescription>
          </Alert>
        )}

        <OfflineUnavailableHelpDialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen} />

        {/* Citadel側で削除済みのレポートがある場合の確認ダイアログ */}
        <Dialog
          open={deletedOnServerDialog !== null}
          onOpenChange={(open) => {
            if (!open) handleDeletedOnServerCancel();
          }}
        >
          <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Citadel側で削除済みのレポートがあります</DialogTitle>
              <DialogDescription asChild>
                <div>
                  <p className="mb-2">
                    以下のレポートはCitadel（管理画面）側で既に削除されています。
                    送信してサーバーに再登録しますか？それとも送信せずローカルから廃棄しますか？
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-left text-sm">
                    {deletedOnServerDialog?.reportTitles.slice(0, 10).map((title, i) => (
                      <li key={deletedOnServerDialog.reportIds[i]} className="truncate">
                        {title || deletedOnServerDialog.reportIds[i]}
                      </li>
                    ))}
                    {(deletedOnServerDialog?.reportIds.length ?? 0) > 10 && (
                      <li className="text-muted-foreground">
                        …他 {(deletedOnServerDialog?.reportIds.length ?? 0) - 10} 件
                      </li>
                    )}
                  </ul>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={handleDeletedOnServerCancel}
                className="w-full sm:w-auto"
              >
                キャンセル
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeletedOnServerDiscard}
                className="w-full sm:w-auto"
              >
                送信せず廃棄する
              </Button>
              <Button onClick={handleDeletedOnServerReRegister} className="w-full sm:w-auto">
                送信して再登録する
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* サーバーとIDが重複するレポートがある場合の選択ダイアログ */}
        <Dialog
          open={uploadConflictDialog !== null}
          onOpenChange={(open) => {
            if (!open) handleUploadConflictCancel();
          }}
        >
          <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>同じIDのレポートがサーバーにあります</DialogTitle>
              <DialogDescription asChild>
                <div>
                  <p className="mb-2">
                    サーバー上に同じIDのレポートが存在します。処理を選択してください。
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-left text-sm">
                    {uploadConflictDialog?.reportTitles.slice(0, 10).map((title, i) => (
                      <li key={uploadConflictDialog.overlappingIds[i]} className="truncate">
                        {title || uploadConflictDialog.overlappingIds[i]}
                      </li>
                    ))}
                    {(uploadConflictDialog?.overlappingIds.length ?? 0) > 10 && (
                      <li className="text-muted-foreground">
                        …他 {(uploadConflictDialog?.overlappingIds.length ?? 0) - 10} 件
                      </li>
                    )}
                  </ul>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={handleUploadConflictCancel}
                className="w-full sm:w-auto"
              >
                キャンセル
              </Button>
              <Button
                variant="secondary"
                onClick={handleUploadConflictCopy}
                className="w-full sm:w-auto"
              >
                新規として保存
              </Button>
              <Button onClick={handleUploadConflictOverwrite} className="w-full sm:w-auto">
                上書き保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* DBスキーマエラー警告 */}
        {dbError && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <div className="flex-1">
                <h2 className="font-semibold text-red-800">データベースエラー</h2>
                <p className="text-sm text-red-700">{dbError}</p>
              </div>
              <button
                onClick={() => resetDatabaseWithConfirm()}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                リセット
              </button>
            </div>
          </div>
        )}

        {/* 閲覧・編集任務でレポート0件: Adminで対象を選択して再Handoffするよう案内 */}
        {missionStatus.hasMission &&
          (missionStatus.mission?.permission === "View" ||
            missionStatus.mission?.permission === "Edit") &&
          counts?.reports === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">
                    閲覧・編集任務ですが、対象レポートがありません
                  </p>
                  <p className="mt-1 text-sm text-amber-700">
                    Adminで対象レポートを1件以上選択してから、再度Direct Handoffを実行してください。
                  </p>
                </div>
              </div>
            </div>
          )}

        {/* Direct Handoff ステータス */}
        {handoffStatus && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-3">
              <Rocket className="h-6 w-6 text-blue-600 animate-pulse" />
              <div>
                <h2 className="font-semibold text-blue-800">Direct Handoff</h2>
                <p className="text-sm text-blue-700">{handoffStatus}</p>
                {importProgress && <p className="text-xs text-blue-600 mt-1">{importProgress}</p>}
              </div>
            </div>
          </div>
        )}

        {/* 任務終了モード: データ退避・初期化 */}
        {missionStatus.allowFinalExport && (
          <section className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-red-800">
              <AlertCircle className="h-5 w-5" />
              任務終了モード
            </h2>
            <p className="mb-3 text-sm text-red-700">
              任務の有効期間が終了しました。退避データ（バックアップ）を生成するか、端末内のデータを全削除して初期状態に戻してください。
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleFinalExport}
                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                <Download className="h-5 w-5" />
                退避データを生成（JSON ダウンロード）
              </button>
              <button
                type="button"
                onClick={handleDataReset}
                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                初期化（全データ削除・初期状態に戻す）
              </button>
            </div>
          </section>
        )}

        {/* データ統計 */}
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-700">
            <Database className="h-5 w-5" />
            データ統計
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TABLE_KEYS.map((key) => (
              <li key={key} className="flex justify-between rounded bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-600">{TABLE_LABELS[key]}</span>
                <span className="font-medium text-gray-900">{counts?.[key] ?? "—"} 件</span>
              </li>
            ))}
          </ul>
        </section>

        {/* JSON インポート */}
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-700">
            <Upload className="h-5 w-5" />
            JSON インポート
          </h2>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              isDragging
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 bg-gray-50 hover:border-gray-400"
            }`}
          >
            <FileJson className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">
              ここに JSON ファイルをドラッグ＆ドロップするか、
              <label className="cursor-pointer font-medium text-blue-600 hover:underline">
                ファイルを選択
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  disabled={isImporting}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </p>
          </div>
          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={clearBeforeImport}
                onChange={(e) => setClearBeforeImport(e.target.checked)}
                className="rounded border-gray-300"
              />
              インポート前に既存データを全消去する
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={importAsNew}
                onChange={(e) => setImportAsNew(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="flex items-center gap-1">
                <Copy className="h-4 w-4 text-orange-500" />
                新規データとして取り込む（ID再採番）
              </span>
            </label>
            {importAsNew && (
              <p className="ml-6 text-xs text-orange-600">
                ※ 全レコードに新しいIDが割り当てられ、親子関係は維持されます。
                同じJSONを複数回インポートすると重複データが作成されます。
              </p>
            )}
          </div>
          {isImporting && (
            <div className="mt-2 text-sm text-gray-500">
              <p>インポート中...</p>
              {importProgress && <p className="text-xs text-blue-600">{importProgress}</p>}
            </div>
          )}
        </section>

        {/* JSON エクスポート */}
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-700">
            <Download className="h-5 w-5" />
            JSON エクスポート
          </h2>
          <p className="mb-3 text-sm text-gray-600">
            現在のローカルDBの全データを db.json 互換形式でダウンロードします。
          </p>
          <button
            type="button"
            onClick={exportJson}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            report_export.json をダウンロード
          </button>
        </section>

        {/* サーバー同期（アップロード） */}
        <section className="rounded-lg border border-blue-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-blue-700">
            <CloudUpload className="h-5 w-5" />
            サーバー同期（アップロード）
          </h2>
          <p className="mb-3 text-sm text-gray-600">
            現在のデータをサーバーに送信します。送信後、レポートデータを端末から削除するか選択できます。
          </p>
          <div className="mb-3 rounded bg-gray-50 px-3 py-2 text-xs text-gray-500">
            送信先: <code className="font-mono">{API_URL}/api/sync/upload</code>
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploadProgress != null ? `送信中... ${uploadProgress}%` : "送信中..."}
              </>
            ) : (
              <>
                <CloudUpload className="h-4 w-4" />
                サーバーへ送信
              </>
            )}
          </button>
          {uploadSuccess && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              {uploadSuccess}
            </div>
          )}
          {uploadError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              {uploadError}
            </div>
          )}
        </section>

        {/* サーバー同期（ダウンロード/差分同期） */}
        <section className="rounded-lg border border-green-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-green-700">
            <RefreshCw className="h-5 w-5" />
            サーバー同期（ダウンロード）
          </h2>
          <p className="mb-3 text-sm text-gray-600">
            サーバーから最新のデータを取得します。差分同期では、前回同期以降に更新されたデータのみを取得します。
          </p>

          {/* 最後の同期日時 */}
          <div className="mb-4 rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {lastSyncTime ? (
              <>
                最終同期:{" "}
                <span className="font-medium">
                  {new Date(lastSyncTime).toLocaleString("ja-JP")}
                </span>
              </>
            ) : (
              <span className="text-gray-400">まだ同期されていません</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* 差分同期ボタン */}
            <button
              type="button"
              onClick={() => handleDeltaSync(false)}
              disabled={isDeltaSyncing || !lastSyncTime}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              title={!lastSyncTime ? "まずフル同期を実行してください" : ""}
            >
              {isDeltaSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {deltaSyncProgress != null ? `同期中... ${deltaSyncProgress}%` : "同期中..."}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  差分同期
                </>
              )}
            </button>

            {/* 差分同期（マスタ含む）ボタン */}
            <button
              type="button"
              onClick={() => handleDeltaSync(true)}
              disabled={isDeltaSyncing || !lastSyncTime}
              className="flex items-center gap-2 rounded-lg border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
              title={!lastSyncTime ? "まずフル同期を実行してください" : ""}
            >
              <RefreshCw className="h-4 w-4" />
              差分同期（マスタ含む）
            </button>

            {/* フル同期ボタン */}
            <button
              type="button"
              onClick={handleFullSync}
              disabled={isDeltaSyncing}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {isDeltaSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              フル同期
            </button>
          </div>

          {isDeltaSyncing && deltaSyncProgress != null && (
            <p className="mt-2 text-sm text-gray-600">保存中... {deltaSyncProgress}%</p>
          )}

          <p className="mt-2 text-xs text-gray-500">
            ※
            差分同期は前回同期以降に更新されたレポートのみを取得します。フル同期は全データを取得します。
          </p>

          {deltaSyncSuccess && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              {deltaSyncSuccess}
            </div>
          )}
          {deltaSyncError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              {deltaSyncError}
            </div>
          )}
        </section>

        {/* メッセージ */}
        {importError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            {importError}
          </div>
        )}
        {importSuccess && (
          <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            {importSuccess}
          </div>
        )}
      </div>
    </main>
  );
}

export default function ManagePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
            <p className="mt-2 text-gray-600">読み込み中...</p>
          </div>
        </main>
      }
    >
      <ManagePageContent />
    </Suspense>
  );
}
