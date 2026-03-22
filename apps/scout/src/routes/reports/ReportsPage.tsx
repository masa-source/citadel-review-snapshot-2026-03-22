import { useLiveQuery } from "dexie-react-hooks";
import { Plus, FileText, Eye, Edit2, AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useCallback, useState } from "react";

import { getRepository } from "@/services/data";
import { ConfirmDialog, useConfirmDialog } from "@citadel/ui";
import { useMissionStatus } from "@/hooks/useMissionStatus";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { Report } from "@citadel/types";
import { deleteReport } from "@/services/report";
import { getReportEditPath } from "@/utils/reportNavigation";

interface ReportWithCompany extends Report {
  companyName: string;
  reportFormatName?: string | null;
}

export default function ReportsPage() {
  const isOnline = useOnlineStatus();
  const missionStatus = useMissionStatus();
  const confirmDialog = useConfirmDialog();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const companyRepo = getRepository("companies");
  const reportRepo = getRepository("reports");
  const reportFormatsRepo = getRepository("reportFormats");
  const reportsWithCompany = useLiveQuery(async (): Promise<ReportWithCompany[]> => {
    const reports = await reportRepo.list();
    const formats = await reportFormatsRepo.list();
    const withCompany = await Promise.all(
      reports.map(async (r) => {
        const company = r.companyId ? await companyRepo.get(r.companyId) : undefined;
        const formatName = r.reportFormatId
          ? (formats.find((f) => String(f.id) === String(r.reportFormatId))?.name ?? null)
          : null;
        return {
          ...r,
          companyName: company?.name ?? "—",
          isLocal: r.isLocal,
          reportFormatName: formatName,
        };
      })
    );
    return withCompany.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [companyRepo, reportFormatsRepo]);

  const handleDeleteLocal = useCallback(
    async (reportId: string) => {
      const ok = await confirmDialog.ask({
        title: "削除の確認",
        description: "このレポートを削除してもよろしいですか？",
        variant: "danger",
        confirmLabel: "削除",
      });
      if (!ok) return;
      setDeletingId(reportId);
      try {
        await deleteReport(reportId);
      } finally {
        setDeletingId(null);
      }
    },
    [confirmDialog]
  );

  const formatDate = (s: string | null | undefined) => {
    if (!s) return "—";
    try {
      const d = s.includes("T") ? s.split("T")[0] : s;
      return d;
    } catch {
      return s;
    }
  };

  // 枠（キャッシュ）と中身（IndexedDB）の分離: 一覧→編集は常に完全遷移（window.location）にし、読み込み時の URL に id が含まれるようにする。router.push だと SW キャッシュや RSC 遅延で id なしシェルが返り新規フォームになることがある。
  const handleOpenReport = useCallback((reportId: string, mode: "edit" | "view") => {
    window.location.assign(getReportEditPath(reportId, mode));
  }, []);

  const canEditReport = missionStatus.canEdit;
  const isViewOrEditMission =
    missionStatus.hasMission &&
    (missionStatus.mission?.permission === "View" || missionStatus.mission?.permission === "Edit");
  const noReports = reportsWithCompany !== undefined && reportsWithCompany.length === 0;
  const blockViewEditNoReports = isViewOrEditMission && noReports;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
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
      <div className="mx-auto max-w-4xl">
        {blockViewEditNoReports && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800">
                  閲覧・編集任務では対象レポートを1件以上選択する必要があります
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  Adminで対象レポートを選択してから、再度Direct Handoffを実行してください。
                </p>
                <Link
                  to="/manage"
                  className="mt-2 inline-flex items-center rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  データ管理へ
                </Link>
              </div>
            </div>
          </div>
        )}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-800 md:text-2xl">レポート一覧</h1>
            {!isOnline && (
              <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                オフライン
              </span>
            )}
            {missionStatus.isExpired && (
              <span className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                任務終了モード
              </span>
            )}
          </div>
          <Link
            to={blockViewEditNoReports ? "/reports" : "/reports/edit"}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg px-5 py-3 text-base font-medium ${
              blockViewEditNoReports || !canEditReport
                ? "cursor-not-allowed bg-gray-300 text-gray-500"
                : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
            }`}
            aria-disabled={blockViewEditNoReports || !canEditReport}
            onClick={(e) => (blockViewEditNoReports || !canEditReport) && e.preventDefault()}
          >
            <Plus className="h-5 w-5" />
            新規作成
          </Link>
        </div>

        {missionStatus.isExpired && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
              <div>
                <p className="font-medium text-red-800">任務が終了しました</p>
                <p className="mt-1 text-sm text-red-700">
                  編集はできません。退避データを生成するか、データをクリアして初期状態に戻してください。
                </p>
                <Link
                  to="/manage"
                  className="mt-2 inline-flex items-center rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  データ管理（退避・初期化）
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {!reportsWithCompany ? (
            <div className="p-8 text-center text-gray-500">読み込み中...</div>
          ) : reportsWithCompany.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-gray-500">
              <FileText className="h-12 w-12 text-gray-300" />
              <p>レポートがありません</p>
              {!blockViewEditNoReports && (
                <Link
                  to="/reports/edit"
                  className="min-h-[44px] rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  新規作成
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {reportsWithCompany.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                    <div className="flex flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-4 min-w-0">
                      <span className="font-medium text-gray-900 md:w-28 shrink-0 truncate">
                        {r.controlNumber ?? "—"}
                      </span>
                      <span className="flex-1 truncate text-gray-700 min-w-0">
                        {r.reportTitle ?? "—"}
                      </span>
                      <span className="text-sm text-gray-500 md:w-24 shrink-0">
                        {formatDate(r.createdAt)}
                      </span>
                      <span className="text-sm text-gray-500 md:w-32 truncate shrink-0">
                        {r.reportFormatName ?? "—"}
                      </span>
                      <span className="text-sm text-gray-500 md:w-28 truncate shrink-0">
                        {r.companyName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenReport(r.id!, "view")}
                        className="flex min-h-[36px] items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <Eye className="h-4 w-4" />
                        閲覧
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenReport(r.id!, "edit")}
                        disabled={!canEditReport}
                        className="flex min-h-[36px] items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                      >
                        <Edit2 className="h-4 w-4" />
                        編集
                      </button>
                      {r.isLocal === true && (
                        <button
                          type="button"
                          onClick={() => handleDeleteLocal(r.id!)}
                          disabled={deletingId === r.id}
                          className="flex min-h-[36px] items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="削除（端末で作成したレポートのみ削除可能）"
                        >
                          {deletingId === r.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          削除
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4">
          <Link
            to="/"
            className="inline-flex min-h-[44px] items-center rounded-lg px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            トップへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
