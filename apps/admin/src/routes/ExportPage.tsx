import { useState, useMemo } from "react";
import useSWR from "swr";
import { Link } from "react-router-dom";
import {
  PackageOpen,
  ArrowLeft,
  Download,
  Loader2,
  CheckSquare,
  Square,
  Search,
  FileEdit,
  Copy,
  AlertCircle,
  ExternalLink,
  Rocket,
} from "lucide-react";
import type { components, ReportListItem } from "@citadel/types";
import {
  apiClient,
  swrFetcher,
  fetchMissions,
  getScoutBaseUrl,
  type MissionItem,
} from "@/utils/api";

import { cn, ConfirmDialog, useConfirmDialog } from "@citadel/ui";

/** フォーム状態は API の ExportRequest に合わせる（OpenAPI 生成型で API 変更時のずれを防止） */
type ExportFormData = components["schemas"]["ExportRequest"];

interface MasterOption {
  key: keyof ExportFormData;
  label: string;
  description: string;
}

const MASTER_OPTIONS: MasterOption[] = [
  { key: "includeCompanies", label: "会社", description: "取引先・自社情報" },
  { key: "includeWorkers", label: "作業者", description: "作業者・担当者情報" },
  { key: "includeInstruments", label: "計器", description: "計器種別情報" },
  { key: "includeSites", label: "現場", description: "現場・拠点情報" },
  {
    key: "includeSchemaDefinitions",
    label: "スキーマ定義",
    description: "メタデータ駆動用スキーマ",
  },
  { key: "includeParts", label: "部品", description: "使用部品情報" },
  { key: "includeOwnedInstruments", label: "所有計器", description: "会社所有の計器" },
  { key: "includeTableDefinitions", label: "表定義", description: "表定義マスタ" },
];

const initialFormData: ExportFormData = {
  includeCompanies: true,
  includeWorkers: true,
  includeInstruments: true,
  includeSites: true,
  includeSchemaDefinitions: true,
  includeParts: true,
  includeOwnedInstruments: true,
  includeTableDefinitions: true,
  targetReportIds: [],
  exportMode: "edit",
  permission: "Collect",
};

export default function ExportPage() {
  const confirmDialog = useConfirmDialog();
  const { data: reports, isLoading: reportsLoading } = useSWR<ReportListItem[]>(
    "/api/reports",
    swrFetcher
  );

  const { data: missions = [], mutate: mutateMissions } = useSWR<MissionItem[]>(
    "/api/missions?status=Active",
    () => fetchMissions("Active")
  );

  const [formData, setFormData] = useState<ExportFormData>(initialFormData);
  const [searchTerm, setSearchTerm] = useState("");
  const [exporting, setExporting] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [fileImportWarning, setFileImportWarning] = useState<string | null>(null);
  const [fileImportPending, setFileImportPending] = useState<Record<string, unknown> | null>(null);
  const [fileImporting, setFileImporting] = useState(false);

  // Direct Handoff オプション
  const [clearBeforeImport, setClearBeforeImport] = useState(true);

  // 検索フィルタリング
  const filteredReports = useMemo(() => {
    if (!reports) return [];
    if (!searchTerm) return reports;
    const term = searchTerm.toLowerCase();
    return reports.filter(
      (r) =>
        r.reportTitle?.toLowerCase().includes(term) ||
        r.controlNumber?.toLowerCase().includes(term) ||
        r.companyName?.toLowerCase().includes(term)
    );
  }, [reports, searchTerm]);

  // マスタ選択切り替え
  const toggleMaster = (key: string) => {
    setFormData((prev) => ({
      ...prev,
      [key]: !prev[key as keyof ExportFormData],
    }));
  };

  // 全マスタ選択/解除
  const toggleAllMasters = (select: boolean) => {
    setFormData((prev) => ({
      ...prev,
      includeCompanies: select,
      includeWorkers: select,
      includeInstruments: select,
      includeSites: select,
      includeSchemaDefinitions: select,
      includeParts: select,
      includeOwnedInstruments: select,
      includeTableDefinitions: select,
    }));
  };

  // レポート選択切り替え
  const toggleReport = (id: string) => {
    setFormData((prev) => {
      const ids = prev.targetReportIds.includes(id)
        ? prev.targetReportIds.filter((rid) => rid !== id)
        : [...prev.targetReportIds, id];
      return { ...prev, targetReportIds: ids };
    });
  };

  // 全レポート選択/解除
  const toggleAllReports = (select: boolean) => {
    if (select && filteredReports) {
      setFormData((prev) => ({
        ...prev,
        targetReportIds: filteredReports.map((r) => r.id),
      }));
    } else {
      setFormData((prev) => ({ ...prev, targetReportIds: [] }));
    }
  };

  // エクスポート実行
  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiClient.POST("/api/sync/export", {
        body: { ...formData },
        parseAs: "blob",
      });
      if (res.error) throw new Error("エクスポートに失敗しました。");

      const blob = new Blob([res.data as Blob], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = formData.exportMode === "copy" ? "report_template.json" : "report_package.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setSuccess("パッケージをダウンロードしました。");
    } catch (err) {
      console.error(err);
      setError("エクスポートに失敗しました。");
    } finally {
      setExporting(false);
    }
  };

  // Direct Handoff: Scoutを起動して転送
  // iOS Safari 等では await 後の window.open がポップアップブロックされるため、
  // ユーザー操作直後に空ウィンドウを開き、API 成功後に URL をセットする。
  const handleDirectHandoff = async () => {
    if (
      (formData.permission === "View" || formData.permission === "Edit") &&
      formData.targetReportIds.length === 0
    ) {
      setError("閲覧・編集・コピーの任務では、対象レポートを1件以上選択してください。");
      return;
    }

    const newWindow = window.open("", "_blank");
    if (!newWindow) {
      setError("ポップアップがブロックされました。ブラウザの設定を確認してください。");
      return;
    }

    try {
      newWindow.document.write("Scoutを起動しています...");
    } catch {
      // クロスオリジン等で write できない場合は無視
    }

    setLaunching(true);
    setError(null);
    setSuccess(null);

    try {
      const handoffRes = await apiClient.POST("/api/sync/handoff", { body: { ...formData } });
      if (handoffRes.error) {
        const detail = (handoffRes.error as { detail?: string })?.detail;
        throw Object.assign(new Error(detail ?? "チケットIDの取得に失敗しました。"), {
          status: handoffRes.response.status,
        });
      }
      const ticketId = (handoffRes.data as { ticketId?: string } | undefined)?.ticketId;

      if (!ticketId) {
        throw new Error("チケットIDの取得に失敗しました。");
      }

      const params = new URLSearchParams({
        ticket: ticketId,
        clear: clearBeforeImport.toString(),
      });
      const scoutUrl = `${getScoutBaseUrl()}/manage?${params.toString()}`;

      newWindow.location.href = scoutUrl;
      setSuccess("Scoutを起動しました。ブラウザの新しいタブを確認してください。");
    } catch (err: unknown) {
      newWindow.close();
      console.error(err);
      if ((err as { status?: number })?.status === 409 && err instanceof Error) {
        setError(err.message);
      } else {
        setError("Scoutの起動に失敗しました。バックエンドが起動していることを確認してください。");
      }
    } finally {
      setLaunching(false);
    }
  };

  const handleFileImportSelect = async (file: File) => {
    setFileImportWarning(null);
    setFileImportPending(null);
    setError(null);
    const text = await file.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      setError("JSON のパースに失敗しました。");
      return;
    }
    const mission = data._mission as { missionId?: string } | undefined;
    if (mission?.missionId) {
      try {
        const res = await apiClient.GET("/api/missions/{mission_id}/status", {
          params: { path: { mission_id: mission.missionId } },
        });
        const status = (res.data as { status?: string } | undefined)?.status;
        if (status === "Purged" || status === "Expired") {
          setFileImportWarning(
            "このデータは旧端末からの退避データです。現在の DB と競合する可能性があります。整合性を確認してから取り込んでください。"
          );
          setFileImportPending(data);
          return;
        }
      } catch {
        // 任務が存在しない場合はそのまま続行
      }
    }
    setFileImportPending(data);
    setFileImportWarning(null);
  };

  const handleFileImportExecute = async () => {
    if (!fileImportPending) return;
    setFileImporting(true);
    setError(null);
    try {
      const { error: uploadErr } = await apiClient.POST("/api/sync/upload", {
        body: fileImportPending,
      });
      if (uploadErr) throw new Error("取り込みに失敗しました。");
      setSuccess("ファイルの取り込みが完了しました。");
      setFileImportPending(null);
      setFileImportWarning(null);
    } catch (err) {
      console.error(err);
      setError("取り込みに失敗しました。");
    } finally {
      setFileImporting(false);
    }
  };

  const handlePurgeMission = async (missionId: string) => {
    const confirmed = await confirmDialog.ask({
      title: "利用停止の確認",
      description: "この端末の利用を停止しますか？該当端末は次回同期で 403 を受けます。",
      confirmLabel: "停止",
      variant: "danger",
    });
    if (!confirmed) return;
    try {
      const { error: purgeErr } = await apiClient.POST("/api/missions/{mission_id}/purge", {
        params: { path: { mission_id: missionId } },
      });
      if (purgeErr) throw new Error("利用停止に失敗しました。");
      await mutateMissions();
    } catch (err) {
      console.error(err);
      setError("利用停止に失敗しました。");
    }
  };

  // 全マスタが選択されているか
  const allMastersSelected = MASTER_OPTIONS.every(
    (opt) => formData[opt.key as keyof ExportFormData]
  );
  // 一部マスタが選択されているか
  const someMastersSelected = MASTER_OPTIONS.some(
    (opt) => formData[opt.key as keyof ExportFormData]
  );

  // 全レポートが選択されているか
  const allReportsSelected =
    filteredReports.length > 0 &&
    filteredReports.every((r) => formData.targetReportIds.includes(r.id));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16 min-h-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <Link to="/" className="flex-shrink-0 p-1 text-gray-600 hover:text-gray-900 -m-1">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="w-8 h-8 flex-shrink-0 bg-indigo-600 rounded-lg flex items-center justify-center">
                <PackageOpen className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">
                データ持ち出し
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左カラム: マスタ選択 & モード選択 */}
          <div className="lg:col-span-1 space-y-6">
            {/* マスタ選択 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">マスタデータ</h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAllMasters(true)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    全選択
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => toggleAllMasters(false)}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    全解除
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {MASTER_OPTIONS.map((opt) => {
                  const checked = formData[opt.key as keyof ExportFormData] as boolean;
                  return (
                    <label
                      key={opt.key}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <button
                        type="button"
                        onClick={() => toggleMaster(opt.key)}
                        className="text-indigo-600"
                      >
                        {checked ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{opt.label}</div>
                        <div className="text-xs text-gray-500">{opt.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* エクスポートモード */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">エクスポートモード</h2>
              <div className="space-y-3">
                <label
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    formData.exportMode === "edit"
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:bg-gray-50"
                  )}
                >
                  <input
                    type="radio"
                    name="exportMode"
                    value="edit"
                    checked={formData.exportMode === "edit"}
                    onChange={() => setFormData({ ...formData, exportMode: "edit" })}
                    className="mt-1"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <FileEdit className="w-4 h-4 text-indigo-600" />
                      <span className="font-medium text-gray-900">編集モード</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      IDを維持して出力。Scoutで編集後、同じIDで上書き保存できます。
                    </p>
                  </div>
                </label>
                <label
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    formData.exportMode === "copy"
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:bg-gray-50"
                  )}
                >
                  <input
                    type="radio"
                    name="exportMode"
                    value="copy"
                    checked={formData.exportMode === "copy"}
                    onChange={() => setFormData({ ...formData, exportMode: "copy" })}
                    className="mt-1"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <Copy className="w-4 h-4 text-orange-600" />
                      <span className="font-medium text-gray-900">コピー（雛形）モード</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      IDを削除して出力。Scoutで新規レポートの雛形として使用できます。
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* エクスポートボタン */}
            <div className="space-y-3">
              <button
                onClick={handleExport}
                disabled={exporting || launching}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-white transition-colors",
                  exporting || launching
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700"
                )}
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    エクスポート中...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Scout用パッケージ作成
                  </>
                )}
              </button>

              {/* Direct Handoff */}
              <div className="border-t border-gray-200 pt-3">
                <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                  <Rocket className="w-3 h-3" />
                  Direct Handoff
                </div>
                <div className="mb-2">
                  <span className="text-xs text-gray-600 block mb-1">任務権限</span>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="permission"
                        checked={formData.permission === "Collect"}
                        onChange={() => setFormData((prev) => ({ ...prev, permission: "Collect" }))}
                        className="border-gray-300 text-indigo-600"
                      />
                      データ採集（Collect）※デフォルト
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="permission"
                        checked={formData.permission === "View"}
                        onChange={() => setFormData((prev) => ({ ...prev, permission: "View" }))}
                        className="border-gray-300 text-indigo-600"
                      />
                      閲覧（View）
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="permission"
                        checked={formData.permission === "Edit"}
                        onChange={() => setFormData((prev) => ({ ...prev, permission: "Edit" }))}
                        className="border-gray-300 text-indigo-600"
                      />
                      編集（Edit）
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="permission"
                        checked={formData.permission === "Copy"}
                        onChange={() =>
                          setFormData((prev) => ({
                            ...prev,
                            permission: "Copy",
                            exportMode: "copy",
                          }))
                        }
                        className="border-gray-300 text-indigo-600"
                      />
                      コピー（Copy）
                    </label>
                  </div>
                  {(formData.permission === "View" ||
                    formData.permission === "Edit" ||
                    formData.permission === "Copy") && (
                    <p className="mt-1 text-xs text-amber-600">
                      閲覧・編集・コピーでは対象レポートを1件以上選択してください。
                    </p>
                  )}
                </div>
                <div className="space-y-2 mb-3">
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clearBeforeImport}
                      onChange={(e) => setClearBeforeImport(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600"
                    />
                    インポート前にScoutのデータを全消去
                  </label>
                  {formData.permission === "Copy" && (
                    <p className="text-xs text-gray-500">
                      コピー（Copy）権限で渡すと、Scout側でマスターID維持・報告書のみ新規として取り込みます。
                    </p>
                  )}
                </div>
                <button
                  onClick={handleDirectHandoff}
                  disabled={
                    exporting ||
                    launching ||
                    ((formData.permission === "View" ||
                      formData.permission === "Edit" ||
                      formData.permission === "Copy") &&
                      formData.targetReportIds.length === 0)
                  }
                  className={cn(
                    "w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-white transition-colors",
                    exporting ||
                      launching ||
                      ((formData.permission === "View" ||
                        formData.permission === "Edit" ||
                        formData.permission === "Copy") &&
                        formData.targetReportIds.length === 0)
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700"
                  )}
                >
                  {launching ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      起動中...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-5 h-5" />
                      Scoutを起動して転送
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 成功メッセージ */}
            {success && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">{success}</p>
              </div>
            )}

            {/* サマリー */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-800 mb-2">エクスポート内容</h3>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>
                  マスタ:{" "}
                  {allMastersSelected
                    ? "全て"
                    : someMastersSelected
                      ? `${MASTER_OPTIONS.filter((o) => formData[o.key as keyof ExportFormData]).length}件`
                      : "なし"}
                </li>
                <li>レポート: {formData.targetReportIds.length}件選択</li>
                <li>モード: {formData.exportMode === "edit" ? "編集" : "コピー（雛形）"}</li>
              </ul>
            </div>
          </div>

          {/* 右カラム: レポート選択 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    レポート選択
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({formData.targetReportIds.length}件選択中)
                    </span>
                  </h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => toggleAllReports(true)}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      全選択
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => toggleAllReports(false)}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      全解除
                    </button>
                  </div>
                </div>
                <div className="mt-3 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="タイトル・管理番号・会社名で検索..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {reportsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                </div>
              ) : filteredReports && filteredReports.length > 0 ? (
                <div className="max-h-[600px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                          <button
                            type="button"
                            onClick={() => toggleAllReports(!allReportsSelected)}
                            className="text-indigo-600"
                          >
                            {allReportsSelected ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          タイトル
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          管理番号
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          会社名
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          作成日
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredReports.map((report) => {
                        const isSelected = formData.targetReportIds.includes(report.id);
                        return (
                          <tr
                            key={report.id}
                            onClick={() => toggleReport(report.id)}
                            className={cn(
                              "cursor-pointer transition-colors",
                              isSelected ? "bg-indigo-50" : "hover:bg-gray-50"
                            )}
                          >
                            <td className="px-4 py-3">
                              <button type="button" className="text-indigo-600">
                                {isSelected ? (
                                  <CheckSquare className="w-5 h-5" />
                                ) : (
                                  <Square className="w-5 h-5 text-gray-400" />
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                              {report.id}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {report.reportTitle || "-"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {report.controlNumber || "-"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {report.companyName || "-"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {report.createdAt
                                ? new Date(report.createdAt).toLocaleDateString("ja-JP")
                                : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <PackageOpen className="w-12 h-12 text-gray-300 mx-auto" />
                  <p className="mt-4 text-sm text-gray-500">
                    {searchTerm
                      ? "検索条件に一致するレポートがありません。"
                      : "レポートが登録されていません。"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ファイルからインポート（退避データなど） */}
        <section className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">ファイルからインポート</h2>
          <p className="text-sm text-gray-600 mb-3">
            Scout からエクスポートした JSON（退避データ含む）を選択し、サーバーに取り込みます。
          </p>
          <input
            type="file"
            accept=".json,application/json"
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-indigo-50 file:text-indigo-700"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileImportSelect(f);
              e.target.value = "";
            }}
          />
          {fileImportWarning && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">{fileImportWarning}</p>
                  <Link
                    to="/templates"
                    className="mt-2 inline-block text-sm text-amber-700 underline"
                  >
                    テンプレート作成へ
                  </Link>
                  {fileImportPending && (
                    <button
                      type="button"
                      onClick={handleFileImportExecute}
                      disabled={fileImporting}
                      className="mt-3 block rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {fileImporting ? "取り込み中..." : "取り込みを実行する"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          {fileImportPending && !fileImportWarning && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-gray-600">ファイルを選択しました。</span>
              <button
                type="button"
                onClick={handleFileImportExecute}
                disabled={fileImporting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {fileImporting ? "取り込み中..." : "取り込み実行"}
              </button>
            </div>
          )}
        </section>

        {/* 派遣中の Scout 名簿 */}
        <section className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <h2 className="px-6 py-4 border-b border-gray-200 text-lg font-semibold text-gray-900">
            派遣中の Scout 名簿（Active 任務）
          </h2>
          {missions.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              現在、Active な任務はありません。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      任務ID
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      権限
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      レポート数
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      最終 Heartbeat
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      有効期限
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {missions.map((m) => (
                    <tr key={m.missionId} className="bg-white">
                      <td
                        className="px-4 py-3 text-xs font-mono text-gray-700 truncate max-w-[120px]"
                        title={m.missionId}
                      >
                        {m.missionId.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{m.permission}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {m.reportIds?.length ?? 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {m.heartbeatAt ? new Date(m.heartbeatAt).toLocaleString("ja-JP") : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {m.expiresAt ? new Date(m.expiresAt).toLocaleString("ja-JP") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handlePurgeMission(m.missionId)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          除名（Purge）
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 使い方ガイド */}
        <div className="mt-8 p-4 bg-gray-100 border border-gray-200 rounded-lg">
          <h3 className="text-sm font-medium text-gray-800 mb-2">使い方</h3>
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
            <li>必要なマスタデータを選択します（デフォルトは全選択）。</li>
            <li>
              持ち出したいレポートを選択します（複数選択可）。レポートを選ばなくても Scout
              を派遣でき、その場合も派遣中の名簿に載ります。
            </li>
            <li>
              エクスポートモードを選択します：
              <ul className="ml-6 mt-1 list-disc list-inside text-gray-500">
                <li>
                  <strong>編集モード</strong>: 既存レポートを編集して返す場合
                </li>
                <li>
                  <strong>コピーモード</strong>: 新規レポートの雛形として使う場合
                </li>
              </ul>
            </li>
            <li>「Scout用パッケージ作成」をクリックしてJSONをダウンロードします。</li>
            <li>ダウンロードしたJSONをScout（現場アプリ）でインポートします。</li>
          </ol>
        </div>
        <ConfirmDialog {...confirmDialog} />
      </main>
    </div>
  );
}
