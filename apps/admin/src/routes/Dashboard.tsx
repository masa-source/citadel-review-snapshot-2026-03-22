import { useState } from "react";
import useSWR from "swr";
import { Link } from "react-router-dom";
import {
  FileDown,
  FileSpreadsheet,
  RefreshCw,
  AlertCircle,
  Loader2,
  FolderOpen,
  Database,
  PackageOpen,
  FlaskConical,
  Menu,
  X,
  Trash2,
  Printer,
} from "lucide-react";
import { swrFetcher, downloadPdf, downloadExcelZip, deleteReport } from "@/utils/api";
import { cn, ConfirmDialog, useConfirmDialog } from "@citadel/ui";
import type { ReportListItem } from "@citadel/types";

export default function Dashboard() {
  const confirmDialog = useConfirmDialog();
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [useHighQualityPdf, setUseHighQualityPdf] = useState(true);

  // バックエンド GET /api/reports からレポート一覧を取得
  const {
    data: reports,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<ReportListItem[]>("/api/reports", swrFetcher);

  const handleDownloadPdf = async (reportId: string) => {
    const key = `pdf-${reportId}`;
    setLoading((prev) => ({ ...prev, [key]: true }));
    setError(null);
    try {
      await downloadPdf(reportId, useHighQualityPdf);
    } catch (e) {
      setError(`PDF生成に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleDownloadExcel = async (reportId: string) => {
    const key = `excel-${reportId}`;
    setLoading((prev) => ({ ...prev, [key]: true }));
    setError(null);
    try {
      await downloadExcelZip(reportId);
    } catch (e) {
      setError(`Excel生成に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    const confirmed = await confirmDialog.ask({
      title: "削除の確認",
      description: "このレポートを削除してもよろしいですか？",
      confirmLabel: "削除",
      variant: "danger",
    });
    if (!confirmed) return;
    const key = `delete-${reportId}`;
    setLoading((prev) => ({ ...prev, [key]: true }));
    setError(null);
    try {
      await deleteReport(reportId);
      await mutate();
    } catch (e) {
      setError(`削除に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16 min-h-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="w-8 h-8 flex-shrink-0 bg-primary rounded-lg flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">
                <span className="sm:hidden">Citadel</span>
                <span className="hidden sm:inline">
                  現場報告管理システム <span className="text-gray-500 font-normal">(Citadel)</span>
                </span>
              </h1>
            </div>
            {/* デスクトップ: 横並びナビ */}
            <nav className="hidden md:flex items-center gap-1 flex-shrink-0">
              <Link
                to="/masters"
                className="flex items-center gap-2 px-2 py-2 sm:px-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <Database className="w-4 h-4" />
                マスタ管理
              </Link>
              <Link
                to="/export"
                className="flex items-center gap-2 px-2 py-2 sm:px-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <PackageOpen className="w-4 h-4" />
                データ持ち出し
              </Link>
              <Link
                to="/templates"
                className="flex items-center gap-2 px-2 py-2 sm:px-3 text-sm text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-md transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                テンプレート作成
              </Link>
              <Link
                to="/demo-data"
                className="flex items-center gap-2 px-2 py-2 sm:px-3 text-sm text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-md transition-colors"
              >
                <FlaskConical className="w-4 h-4" />
                デモデータ
              </Link>
              <button
                onClick={() => mutate()}
                className="flex items-center gap-2 px-2 py-2 sm:px-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                更新
              </button>
            </nav>
            {/* スマホ: ハンバーガーボタン */}
            <div className="flex items-center gap-1 flex-shrink-0 md:hidden">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="p-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                aria-expanded={menuOpen}
                aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
              >
                {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
          {/* スマホ: 開いたメニュー */}
          {menuOpen && (
            <nav
              className="md:hidden border-t border-gray-200 bg-white py-2"
              aria-label="メインメニュー"
            >
              <div className="flex flex-col">
                <Link
                  to="/masters"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-md"
                >
                  <Database className="w-4 h-4" />
                  マスタ管理
                </Link>
                <Link
                  to="/export"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-md"
                >
                  <PackageOpen className="w-4 h-4" />
                  データ持ち出し
                </Link>
                <Link
                  to="/templates"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-amber-700 hover:bg-amber-50 rounded-md"
                >
                  <FolderOpen className="w-4 h-4" />
                  テンプレート作成
                </Link>
                <Link
                  to="/demo-data"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-amber-600 hover:bg-amber-50 rounded-md"
                >
                  <FlaskConical className="w-4 h-4" />
                  デモデータ
                </Link>
                <button
                  onClick={() => {
                    mutate();
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-md text-left"
                >
                  <RefreshCw className="w-4 h-4" />
                  更新
                </button>
              </div>
            </nav>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Alert */}
        {(error || fetchError) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">エラーが発生しました</p>
              <p className="text-sm text-red-600 mt-1">
                {error ||
                  (fetchError instanceof Error ? fetchError.message : "データの取得に失敗しました")}
              </p>
            </div>
          </div>
        )}

        {/* Reports Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">レポート一覧</h2>
              <p className="text-sm text-gray-500 mt-1">
                登録されているレポートの一覧です。PDF・Excelを出力できます。
              </p>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
              <input
                type="checkbox"
                checked={useHighQualityPdf}
                onChange={(e) => setUseHighQualityPdf(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Printer className="w-4 h-4 text-gray-500" />
              <span>高画質モード (MS Print to PDF)</span>
            </label>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          ) : reports && reports.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      件名
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      会社名
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      作成日
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      アクション
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {reports.map((report) => (
                    <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {report.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {report.reportTitle || "-"}
                          </p>
                          <p className="text-xs text-gray-500">{report.controlNumber}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {report.companyName || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(report.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDownloadPdf(report.id)}
                            disabled={loading[`pdf-${report.id}`]}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                              "bg-blue-50 text-blue-700 hover:bg-blue-100",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            {loading[`pdf-${report.id}`] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <FileDown className="w-4 h-4" />
                            )}
                            PDF作成
                          </button>
                          <button
                            onClick={() => handleDownloadExcel(report.id)}
                            disabled={loading[`excel-${report.id}`]}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                              "bg-green-50 text-green-700 hover:bg-green-100",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            {loading[`excel-${report.id}`] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="w-4 h-4" />
                            )}
                            Excel一括DL
                          </button>
                          <button
                            onClick={() => handleDeleteReport(report.id)}
                            disabled={loading[`delete-${report.id}`]}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                              "bg-red-50 text-red-700 hover:bg-red-100",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                            title="削除"
                          >
                            {loading[`delete-${report.id}`] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-4 text-sm text-gray-500">レポートがありません</p>
            </div>
          )}
        </div>

        {/* Info Card */}
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="text-sm font-medium text-green-800">接続ステータス</h3>
          <ul className="mt-2 text-sm text-green-700 list-disc list-inside space-y-1">
            <li>バックエンド API と完全接続済みです。</li>
            <li>PDF・Excel出力はバックエンドがDBから直接データを取得します。</li>
            <li>
              バックエンドは同じホストの <code className="bg-green-100 px-1 rounded">:8000</code>{" "}
              で起動している必要があります（別PCから開く場合も同じサーバのAPIに接続されます）。
            </li>
          </ul>
        </div>
        <ConfirmDialog {...confirmDialog} />
      </main>
    </div>
  );
}
