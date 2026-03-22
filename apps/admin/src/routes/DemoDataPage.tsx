import { useState, useCallback } from "react";
import useSWR from "swr";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  FlaskConical,
  Play,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Loader2,
  Building2,
  Users,
  Wrench,
  Package,
  FileText,
  Gauge,
} from "lucide-react";

import { swrFetcher, getApiBaseUrl, type DemoStatus } from "@/utils/api";
import { ConfirmDialog, useConfirmDialog } from "@citadel/ui";

interface DemoResult {
  success: boolean;
  message: string;
  counts: Record<string, number>;
}

export default function DemoDataPage() {
  const confirmDialog = useConfirmDialog();
  const [isSeeding, setIsSeeding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    data: status,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<DemoStatus>("/api/demo/status", swrFetcher, {
    refreshInterval: 0,
  });

  const handleSeed = useCallback(async () => {
    const confirmed = await confirmDialog.ask({
      title: "デモデータの投入",
      description: "デモデータを投入しますか？\n既存のデモデータは上書きされます。",
      confirmLabel: "投入",
      variant: "default",
    });
    if (!confirmed) return;

    setIsSeeding(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/demo/seed`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "デモデータの投入に失敗しました");
      }

      const data: DemoResult = await res.json();
      setResult(data);
      mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setIsSeeding(false);
    }
  }, [mutate, confirmDialog]);

  const handleClear = useCallback(async () => {
    const confirmed = await confirmDialog.ask({
      title: "デモデータの削除",
      description: "デモデータを削除しますか？\n[DEMO] プレフィックスのデータのみ削除されます。",
      confirmLabel: "削除",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsClearing(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/demo/clear`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "デモデータの削除に失敗しました");
      }

      const data: DemoResult = await res.json();
      setResult(data);
      mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setIsClearing(false);
    }
  }, [mutate, confirmDialog]);

  const statusItems = [
    { key: "companies", label: "会社", icon: Building2, color: "text-blue-600" },
    { key: "workers", label: "作業者", icon: Users, color: "text-green-600" },
    { key: "instruments", label: "計器", icon: Gauge, color: "text-purple-600" },
    { key: "parts", label: "部品", icon: Package, color: "text-orange-600" },
    { key: "owned_instruments", label: "所有計器", icon: Wrench, color: "text-pink-600" },
    { key: "reports", label: "レポート", icon: FileText, color: "text-indigo-600" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 sm:gap-4 h-14 sm:h-16 min-h-0">
            <Link
              to="/"
              className="flex-shrink-0 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors -m-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-8 h-8 flex-shrink-0 bg-amber-500 rounded-lg flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate min-w-0">
              デモデータ管理
            </h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {/* Success Alert */}
        {result && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">{result.message}</p>
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <FlaskConical className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">デモデータについて</p>
              <ul className="text-sm text-amber-700 mt-1 list-disc list-inside space-y-1">
                <li>
                  デモデータは名前に <code className="bg-amber-100 px-1 rounded">[DEMO]</code>{" "}
                  プレフィックスが付きます
                </li>
                <li>削除時は [DEMO] プレフィックスのデータのみ削除されます</li>
                <li>本番データには影響しません</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Status Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">現在のデモデータ</h2>
            <button
              onClick={() => mutate()}
              disabled={isLoading}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : status ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {statusItems.map(({ key, label, icon: Icon, color }) => (
                  <div key={key} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${color}`} />
                      <span className="text-xs text-gray-500">{label}</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {status.counts[key as keyof typeof status.counts] ?? 0}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span
                  className={`w-2 h-2 rounded-full ${status.has_demo_data ? "bg-green-500" : "bg-gray-300"}`}
                />
                {status.has_demo_data
                  ? `デモデータあり（合計 ${status.total} 件）`
                  : "デモデータなし"}
              </div>
            </>
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">操作</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleSeed}
              disabled={isSeeding || isClearing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSeeding ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5" />
              )}
              デモデータを投入
            </button>
            <button
              onClick={handleClear}
              disabled={isSeeding || isClearing || !status?.has_demo_data}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isClearing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Trash2 className="w-5 h-5" />
              )}
              デモデータを削除
            </button>
          </div>
        </div>
        <ConfirmDialog {...confirmDialog} />
      </main>
    </div>
  );
}
