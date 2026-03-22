import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { Link } from "react-router-dom";
import {
  FileSpreadsheet,
  Upload,
  Trash2,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Pencil,
  Save,
  X,
  MessageSquare,
  LayoutGrid,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  apiClient,
  swrFetcher,
  fetchReportFormatTemplates,
  unwrap,
  autoGenerateTemplate,
  type TemplateItem,
  type ReportFormatItem,
  type TemplateScanResultItem,
} from "@/utils/api";
import { notify } from "@/services/notify";

import { cn, ConfirmDialog, useConfirmDialog } from "@citadel/ui";
import { TreeView } from "@/components/TreeView";
import { buildTemplateTree } from "@/utils/treeBuilders";
import { TemplatePicker } from "@/components/TemplatePicker";

const GREETING_STORAGE_KEY = "bookbinder-greeting-dismissed";

interface EditFormData {
  name: string;
  filePath: string;
}

interface SyncErrorItem {
  filePath: string;
  message: string;
}

export default function TemplatesPage() {
  const confirmDialog = useConfirmDialog();
  const {
    data: templates,
    error,
    isLoading,
    mutate,
  } = useSWR<TemplateItem[]>("/api/templates", swrFetcher);

  const { data: reportFormats, mutate: mutateFormats } = useSWR<ReportFormatItem[]>(
    "/api/report-formats",
    swrFetcher
  );

  const [uploading, setUploading] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 整合性スキャン
  const [scanResult, setScanResult] = useState<TemplateScanResultItem | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncCurrentIndex, setSyncCurrentIndex] = useState(0);
  const [syncTotal, setSyncTotal] = useState(0);
  const [syncCurrentFile, setSyncCurrentFile] = useState<string>("");
  const [syncErrors, setSyncErrors] = useState<SyncErrorItem[]>([]);
  const syncAbortRef = useRef(false);

  // 新規アップロード用フォーム（テンプレート部品のみ：ファイル＋表示名）
  const [formData, setFormData] = useState({
    name: "",
  });

  // 編集用ステート
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    name: "",
    filePath: "",
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // レポート種別の構成モーダル
  const [formatModalFormatId, setFormatModalFormatId] = useState<string | null>(null);
  const [formatModalItems, setFormatModalItems] = useState<
    { templateId: string; sortOrder: number }[]
  >([]);
  const [formatModalSaving, setFormatModalSaving] = useState(false);
  const [newFormatName, setNewFormatName] = useState("");
  const [addingFormat, setAddingFormat] = useState(false);

  const openFormatModal = async (formatId: string) => {
    setFormatModalFormatId(formatId);
    try {
      const data = await fetchReportFormatTemplates(formatId);
      setFormatModalItems(
        (data ?? []).map((row) => ({
          templateId: row.templateId,
          sortOrder: row.sortOrder ?? 0,
        }))
      );
    } catch {
      setFormatModalItems([]);
    }
  };

  const saveFormatComposition = async () => {
    if (!formatModalFormatId) return;
    setFormatModalSaving(true);
    try {
      await unwrap(
        apiClient.PUT("/api/report-formats/{format_id}/templates", {
          params: { path: { format_id: formatModalFormatId } },
          body: {
            items: formatModalItems
              .filter((item) => item.templateId)
              .map((item, i) => ({
                templateId: item.templateId,
                sortOrder: item.sortOrder ?? i,
              })),
          },
        })
      );
      setFormatModalFormatId(null);
      mutateFormats();
    } catch (err) {
      console.error(err);
      alert("構成の保存に失敗しました。");
    } finally {
      setFormatModalSaving(false);
    }
  };

  const addFormat = async () => {
    const name = newFormatName.trim();
    if (!name) return;
    setAddingFormat(true);
    try {
      await unwrap(apiClient.POST("/api/report-formats", { body: { name } }));
      setNewFormatName("");
      mutateFormats();
    } catch (err) {
      console.error(err);
      alert("レポート種別の追加に失敗しました。");
    } finally {
      setAddingFormat(false);
    }
  };

  const deleteFormat = async (formatId: string, formatName: string) => {
    const confirmed = await confirmDialog.ask({
      title: "レポート種別の削除",
      description: `レポート種別「${formatName}」を削除しますか？構成も削除されます。`,
      confirmLabel: "削除",
      variant: "danger",
    });
    if (!confirmed) return;
    try {
      await unwrap(
        apiClient.DELETE("/api/report-formats/{format_id}", {
          params: { path: { format_id: formatId } },
        })
      );
      mutateFormats();
      if (formatModalFormatId === formatId) setFormatModalFormatId(null);
    } catch (err) {
      console.error(err);
      alert("削除に失敗しました。");
    }
  };

  // 製本職人の挨拶：localStorage で「以後表示しない」を永続化（初回は表示）
  const [greetingDismissed, setGreetingDismissed] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setGreetingDismissed(localStorage.getItem(GREETING_STORAGE_KEY) === "true");
  }, []);
  const handleDismissGreeting = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(GREETING_STORAGE_KEY, "true");
    }
    setGreetingDismissed(true);
  };

  // ページマウント時に整合性スキャン
  useEffect(() => {
    let cancelled = false;
    setScanLoading(true);
    swrFetcher<TemplateScanResultItem>("/api/templates/scan")
      .then((data) => {
        if (!cancelled) setScanResult(data);
      })
      .catch(() => {
        if (!cancelled) setScanResult(null);
      })
      .finally(() => {
        if (!cancelled) setScanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStartSync = () => {
    const newFiles = scanResult?.newFiles ?? [];
    if (!newFiles.length) return;
    setSyncModalOpen(true);
    setSyncErrors([]);
    setSyncInProgress(true);
    syncAbortRef.current = false;
    setSyncTotal(newFiles.length);
    setSyncCurrentIndex(0);
    setSyncCurrentFile("");

    const runSync = async () => {
      for (let i = 0; i < newFiles.length; i++) {
        if (syncAbortRef.current) break;
        const filePath = newFiles[i];
        const fileName = filePath.split("/").pop() ?? filePath;
        setSyncCurrentIndex(i + 1);
        setSyncCurrentFile(fileName);
        try {
          const { error: syncErr } = await apiClient.POST("/api/templates/sync-file", {
            body: { filePath },
          });
          if (syncErr) {
            const message = (syncErr as { detail?: string })?.detail ?? "不明なエラー";
            setSyncErrors((prev) => [...prev, { filePath: fileName, message }]);
          } else {
            mutate();
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "不明なエラー";
          setSyncErrors((prev) => [...prev, { filePath: fileName, message }]);
        }
      }
      setSyncInProgress(false);
    };
    runSync();
  };

  const handleCloseSyncModal = () => {
    if (!syncInProgress) {
      setSyncModalOpen(false);
      setScanResult(null);
      mutate();
    }
  };

  const handleAbortSync = () => {
    syncAbortRef.current = true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setFormError("ファイルを選択してください。");
      return;
    }
    if (!formData.name.trim()) {
      setFormError("表示名を入力してください。");
      return;
    }
    const name = formData.name.trim();
    setUploading(true);
    try {
      const formBody = new FormData();
      formBody.append("file", file);
      formBody.append("name", name);

      const { error: uploadErr } = await apiClient.POST("/api/templates", {
        body: {} as { file: string; name: string },
        bodySerializer: () => formBody,
      });
      if (uploadErr) {
        const detail = (uploadErr as { detail?: string })?.detail;
        throw new Error(detail ?? "納品に失敗しました。");
      }

      setFormData({ name: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      mutate();
    } catch (err) {
      const message = err instanceof Error ? err.message : "納品に失敗しました。";
      setFormError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleAiGenerate = async (e: React.MouseEvent) => {
    e.preventDefault();
    setFormError(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setFormError("ファイルを選択してください。");
      return;
    }
    if (!formData.name.trim()) {
      setFormError("表示名を入力してください。");
      return;
    }
    const name = formData.name.trim();
    setIsAiGenerating(true);
    try {
      await autoGenerateTemplate(file, name);
      setFormData({ name: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      mutate();
      notify.success("AIによるテンプレート構築とデータ登録が完了しました。");
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI生成に失敗しました。";
      setFormError(message);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleDelete = async (template: TemplateItem) => {
    const message = template.fileExists
      ? "このテンプレート部品を削除しますか？"
      : "物理ファイルが見つかりません。参照先が間違っている可能性がありますが、DBの登録情報のみを削除しますか？";
    const confirmed = await confirmDialog.ask({
      title: "テンプレートの削除",
      description: message,
      confirmLabel: "削除",
      variant: "danger",
    });
    if (!confirmed) return;

    setDeleting(template.id);
    try {
      const { error: delErr } = await apiClient.DELETE("/api/templates/{template_id}", {
        params: { path: { template_id: template.id } },
      });
      if (delErr) throw new Error("削除に失敗しました。");
      mutate();
    } catch (err) {
      alert("削除に失敗しました。");
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  // 編集モードを開始
  const handleEdit = (template: TemplateItem) => {
    setEditingId(template.id);
    setEditFormData({
      name: template.name ?? "",
      filePath: template.filePath ?? "",
    });
    setEditError(null);
  };

  // 編集をキャンセル
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditFormData({ name: "", filePath: "" });
    setEditError(null);
  };

  // 編集を保存
  const handleSaveEdit = async () => {
    if (!editingId) return;

    if (!editFormData.name.trim()) {
      setEditError("表示名を入力してください。");
      return;
    }

    setSaving(true);
    setEditError(null);
    try {
      const body: { name: string; filePath?: string } = {
        name: editFormData.name.trim(),
      };
      if (editFormData.filePath.trim() !== "") {
        body.filePath = editFormData.filePath.trim();
      }
      const { error: putErr } = await apiClient.PUT("/api/templates/{template_id}", {
        params: { path: { template_id: editingId } },
        body,
      });
      if (putErr) throw new Error("保存に失敗しました。");
      mutate();
      setEditingId(null);
      setEditFormData({ name: "", filePath: "" });
    } catch (err) {
      console.error(err);
      setEditError("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

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
              <div className="w-8 h-8 flex-shrink-0 bg-amber-600 rounded-lg flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">
                テンプレート作成
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 整合性スキャン：不整合がある場合の警告バナー */}
        {!scanLoading && scanResult?.inconsistent && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">
                    template-local 内のファイルが変更されています。
                  </p>
                  <p className="mt-1 text-sm text-amber-800">
                    DB への反映（インポート）を開始しますか？ 新規ファイルは 1
                    件ずつ検疫のうえ登録されます。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleStartSync}
                disabled={scanResult.newFiles.length === 0}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors",
                  scanResult.newFiles.length === 0
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-amber-600 hover:bg-amber-700"
                )}
              >
                <RefreshCw className="w-4 h-4" />
                同期を開始
              </button>
            </div>
          </div>
        )}

        {/* 製本職人の挨拶（閉じると localStorage で永続化） */}
        {!greetingDismissed && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-600">
                  <MessageSquare className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-amber-900">ここは製本工房です。</p>
                  <p className="mt-1 text-sm text-amber-800">
                    私は製本職人として、あなたのテンプレート作成（納品）をお手伝いします。複数の頁（シート）を持つ複雑なファイルもお任せください。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDismissGreeting}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
              >
                以後、表示しない
              </button>
            </div>
          </div>
        )}

        {/* 納品フォーム */}
        <div className="bg-white rounded-xl shadow-sm border border-amber-200/60 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-amber-600" />
            ファイルを納品する
          </h2>
          <p className="text-sm text-amber-800/80 mb-2">
            .xlsx
            形式のみ受付です。マクロ・外部参照・埋め込み・パスワード付きのファイルは検疫でお断りします。
          </p>
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm text-amber-900">
            <p className="font-medium mb-1">ファイル形式について</p>
            <p className="mb-1">
              ファイル選択時に .xlsx が表示されない場合、.xls（旧形式）や
              .xlsm（マクロ付き）である可能性があります。
            </p>
            <p className="mb-1">
              Excelでファイルを開き、[名前を付けて保存] から [Excelブック (*.xlsx)]
              を選択して保存し直してから納品してください。
            </p>
            <p>複数シートがあるファイルも、すべてのシートが結合されて1つのPDFになります。</p>
          </div>

          {formError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{formError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isAiGenerating && (
              <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-900">
                <Loader2 className="w-6 h-6 flex-shrink-0 animate-spin" />
                <p className="text-sm font-medium">
                  AIが分析してマスタとプレースホルダを構築中...（最大1〜2分かかります）
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Excelファイル (.xlsx)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  disabled={uploading || isAiGenerating}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-amber-50 file:text-amber-800 hover:file:bg-amber-100 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">表示名</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={uploading || isAiGenerating}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder="表紙①"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={uploading || isAiGenerating}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors",
                  uploading || isAiGenerating
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-amber-600 hover:bg-amber-700"
                )}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    納品中...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    ファイルを納品する
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleAiGenerate}
                disabled={uploading || isAiGenerating}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors",
                  uploading || isAiGenerating
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-violet-600 hover:bg-violet-700"
                )}
              >
                {isAiGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    AIにおまかせ生成（Beta）
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Templates List */}
        <div className="bg-white rounded-xl shadow-sm border border-amber-200/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-200/60">
            <h2 className="text-lg font-semibold text-gray-900">登録済みテンプレート部品</h2>
            <p className="text-sm text-amber-800/80 mt-1">
              編集で表示名・ファイルパスを変更できます。どのレポート種別で何番目に使うかは「レポート種別の構成」で設定します。
            </p>
            <p className="text-xs text-gray-600 mt-1">
              設計台でプレースホルダを挿入する際は、キー参照（reportWorkersByWorkerId
              等）を使うと編集・同期後も同じセルに同じ値が入ります。
            </p>
          </div>

          {/* 編集エラー表示 */}
          {editError && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{editError}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-600">データの取得に失敗しました。</div>
          ) : templates && templates.length > 0 ? (
            <div className="overflow-x-auto px-4 pb-4">
              <TreeView
                nodes={buildTemplateTree<TemplateItem>(templates)}
                renderLeaf={(template) => {
                  const isEditing = editingId === template.id;
                  return (
                    <div
                      className={cn(
                        "flex flex-wrap items-center gap-x-4 gap-y-2 py-1 pr-2 rounded",
                        isEditing && "bg-amber-50/50"
                      )}
                    >
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        {isEditing ? (
                          <>
                            <input
                              type="text"
                              value={editFormData.name}
                              onChange={(e) =>
                                setEditFormData({ ...editFormData, name: e.target.value })
                              }
                              className="w-full max-w-[200px] px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                              placeholder="表示名"
                            />
                            <input
                              type="text"
                              value={editFormData.filePath}
                              onChange={(e) =>
                                setEditFormData({ ...editFormData, filePath: e.target.value })
                              }
                              className={cn(
                                "w-full min-w-[180px] max-w-[320px] px-2 py-1 border rounded text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:border-amber-500",
                                !template.fileExists
                                  ? "border-amber-500 bg-amber-50/50"
                                  : "border-gray-300"
                              )}
                              placeholder="例: template-local/ファイル名.xlsx"
                            />
                            {!template.fileExists && (
                              <p className="text-xs text-amber-700 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                ファイルが見つかりません。
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {template.name}
                            </span>
                            <span
                              className={cn(
                                "text-sm font-mono text-gray-500 truncate",
                                !template.fileExists && "text-amber-700"
                              )}
                              title={template.filePath}
                            >
                              {template.filePath}
                              {!template.fileExists && (
                                <span
                                  className="ml-1 text-amber-600"
                                  title="物理ファイルが存在しません"
                                >
                                  ⚠️
                                </span>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isEditing ? (
                          <>
                            <button
                              onClick={handleSaveEdit}
                              disabled={saving}
                              className={cn(
                                "inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                                saving
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                  : "bg-green-50 text-green-700 hover:bg-green-100"
                              )}
                            >
                              {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                              保存
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={saving}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                            >
                              <X className="w-4 h-4" />
                              キャンセル
                            </button>
                          </>
                        ) : (
                          <>
                            <Link
                              to={`/templates/drafting/${template.id}`}
                              className={cn(
                                "inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                                editingId !== null
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none"
                                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                              )}
                            >
                              <LayoutGrid className="w-4 h-4" />
                              設計台
                            </Link>
                            <button
                              onClick={() => handleEdit(template)}
                              disabled={editingId !== null}
                              className={cn(
                                "inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                                editingId !== null
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                              )}
                            >
                              <Pencil className="w-4 h-4" />
                              編集
                            </button>
                            <button
                              onClick={() => handleDelete(template)}
                              disabled={deleting === template.id || editingId !== null}
                              className={cn(
                                "inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                                deleting === template.id || editingId !== null
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                  : "bg-red-50 text-red-700 hover:bg-red-100"
                              )}
                            >
                              {deleting === template.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                              削除
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
            </div>
          ) : (
            <div className="text-center py-12">
              <FileSpreadsheet className="w-12 h-12 text-amber-300 mx-auto" />
              <p className="mt-4 text-sm text-amber-800/80">
                登録済みテンプレートがありません。上のフォームから .xlsx
                ファイルを納品してください。
              </p>
            </div>
          )}
        </div>

        {/* レポート種別の構成 */}
        <div className="bg-white rounded-xl shadow-sm border border-amber-200/60 p-6 mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">レポート種別の構成</h2>
          <p className="text-sm text-amber-800/80 mb-4">
            レポートの「報告書種別」に表示する名前と、その種別で使うテンプレート部品の並び順を管理します。
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              type="text"
              value={newFormatName}
              onChange={(e) => setNewFormatName(e.target.value)}
              placeholder="例: 定期点検報告書"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="button"
              onClick={addFormat}
              disabled={addingFormat || !newFormatName.trim()}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addingFormat ? "追加中..." : "種別を追加"}
            </button>
          </div>
          {reportFormats && reportFormats.length > 0 ? (
            <ul className="space-y-2">
              {reportFormats.map((fmt) => (
                <li
                  key={fmt.id}
                  className="flex items-center justify-between gap-4 py-2 px-3 rounded-lg bg-gray-50 border border-gray-200"
                >
                  <span className="font-medium text-gray-900">{fmt.name || "(無名)"}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openFormatModal(fmt.id)}
                      className="px-3 py-1.5 text-sm font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100"
                    >
                      構成を編集
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteFormat(fmt.id, fmt.name || "")}
                      className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100"
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              レポート種別がありません。上で追加してください。
            </p>
          )}
        </div>
      </main>

      {/* 構成編集モーダル */}
      {formatModalFormatId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="format-modal-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full border border-gray-200 max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 id="format-modal-title" className="text-lg font-semibold text-gray-900">
                テンプレート構成
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                この種別で使うテンプレート部品を並び順で指定します。
              </p>
            </div>
            <div className="px-4 py-4 overflow-auto min-h-0">
              <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      No.
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      テンプレート部品
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      並び
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {formatModalItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-gray-500 text-sm">
                        テンプレートが設定されていません。「追加」ボタンから登録してください。
                      </td>
                    </tr>
                  ) : (
                    formatModalItems.map((item, idx) => (
                      <tr key={idx} className="transition-colors hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600 w-12">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <TemplatePicker
                            templates={templates ?? []}
                            value={item.templateId}
                            onChange={(id) =>
                              setFormatModalItems((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, templateId: id } : p))
                              )
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => {
                                if (idx <= 0) return;
                                setFormatModalItems((prev) => {
                                  const next = [...prev];
                                  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                  return next.map((p, i) => ({ ...p, sortOrder: i }));
                                });
                              }}
                              className={cn(
                                "inline-flex items-center justify-center p-1.5 rounded-md transition-colors",
                                idx === 0
                                  ? "text-gray-300 cursor-not-allowed"
                                  : "text-gray-600 hover:bg-gray-200"
                              )}
                              title="上へ"
                              aria-label="上へ"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === formatModalItems.length - 1}
                              onClick={() => {
                                if (idx >= formatModalItems.length - 1) return;
                                setFormatModalItems((prev) => {
                                  const next = [...prev];
                                  [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                  return next.map((p, i) => ({ ...p, sortOrder: i }));
                                });
                              }}
                              className={cn(
                                "inline-flex items-center justify-center p-1.5 rounded-md transition-colors",
                                idx === formatModalItems.length - 1
                                  ? "text-gray-300 cursor-not-allowed"
                                  : "text-gray-600 hover:bg-gray-200"
                              )}
                              title="下へ"
                              aria-label="下へ"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setFormatModalItems((prev) =>
                                prev
                                  .filter((_, i) => i !== idx)
                                  .map((p, i) => ({ ...p, sortOrder: i }))
                              );
                            }}
                            className="inline-flex items-center justify-center p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors"
                            title="削除"
                            aria-label="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() =>
                    setFormatModalItems((prev) => [
                      ...prev,
                      { templateId: "", sortOrder: prev.length },
                    ])
                  }
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  テンプレートを追加
                </button>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex責 justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormatModalFormatId(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveFormatComposition}
                disabled={formatModalSaving}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {formatModalSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 同期進捗モーダル */}
      {syncModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify中心 p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sync-modal-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-gray-200 flex flex-col max-h-[85vh] overflow-hidden">
            <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
              <h2 id="sync-modal-title" className="text-lg font-semibold text-gray-900">
                テンプレート同期
              </h2>
            </div>
            <div className="px-4 py-4 space-y-4 overflow-auto min-h-0">
              {syncInProgress ? (
                <>
                  <p className="text-sm text-gray-600">
                    現在 {syncCurrentIndex}/{syncTotal} ファイル目を処理中...
                  </p>
                  {syncCurrentFile && (
                    <p
                      className="text-sm font-mono text-amber-800 bg-amber-50 px-3 py-2 rounded-lg truncate"
                      title={syncCurrentFile}
                    >
                      {syncCurrentFile}
                    </p>
                  )}
                  <div className="flex justify-center">
                    <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-600">同期が完了しました。</p>
              )}
              {syncErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-800 mb-2">
                    インポートに失敗したファイル
                  </p>
                  <ul className="space-y-1.5 text-sm text-red-700">
                    {syncErrors.map((e, i) => (
                      <li key={i} className="flex flex-col gap-0.5">
                        <span className="font-mono truncate" title={e.filePath}>
                          {e.filePath}
                        </span>
                        <span className="text-red-600 text-xs">{e.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
              {syncInProgress ? (
                <button
                  type="button"
                  onClick={handleAbortSync}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                >
                  中止
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCloseSyncModal}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 font-medium"
                >
                  閉じる
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog {...confirmDialog} />
    </div>
  );
}
