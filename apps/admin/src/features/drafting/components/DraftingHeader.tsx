import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Save,
  FileSpreadsheet,
  LayoutGrid,
  Maximize2,
  List,
  FileEdit,
  Grid3X3,
} from "lucide-react";
import { cn } from "@citadel/ui";
import type { LayoutMode, EditMode } from "@/features/drafting/types";

export interface DraftingHeaderProps {
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
  editMode: EditMode;
  onEditModeChange: (mode: EditMode) => void;
  useExcelInstance: boolean;
  onUseExcelInstanceChange: (value: boolean) => void;
  saving: boolean;
  pendingChangesCount: number;
  onSave: () => void;
  saveError: string | null;
}

export function DraftingHeader({
  layoutMode,
  onLayoutModeChange,
  editMode,
  onEditModeChange,
  useExcelInstance,
  onUseExcelInstanceChange,
  saving,
  pendingChangesCount,
  onSave,
}: DraftingHeaderProps) {
  return (
    <header className="bg-white border-b border-amber-200/60 shadow-sm sticky top-0 z-40">
      <div className="max-w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center gap-2 h-14 min-h-0 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Link
              to="/templates"
              className="flex-shrink-0 p-1 text-amber-700 hover:text-amber-800 -m-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-8 h-8 flex-shrink-0 bg-amber-600 rounded-lg flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-gray-900 truncate">簡易設計台</h1>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <div
              className="flex rounded-lg border border-gray-200 p-0.5"
              role="group"
              aria-label="表示レイアウト"
            >
              <button
                type="button"
                onClick={() => onLayoutModeChange("split")}
                className={cn(
                  "p-2 rounded-md transition-colors",
                  layoutMode === "split"
                    ? "bg-amber-100 text-amber-800"
                    : "text-gray-600 hover:bg-gray-100"
                )}
                title="分割表示"
                aria-pressed={layoutMode === "split"}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onLayoutModeChange("grid")}
                className={cn(
                  "p-2 rounded-md transition-colors",
                  layoutMode === "grid"
                    ? "bg-amber-100 text-amber-800"
                    : "text-gray-600 hover:bg-gray-100"
                )}
                title="グリッド最大化"
                aria-pressed={layoutMode === "grid"}
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onLayoutModeChange("tree")}
                className={cn(
                  "p-2 rounded-md transition-colors",
                  layoutMode === "tree"
                    ? "bg-amber-100 text-amber-800"
                    : "text-gray-600 hover:bg-gray-100"
                )}
                title="ツリー最大化"
                aria-pressed={layoutMode === "tree"}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <div
              className="flex rounded-lg border border-gray-200 p-0.5"
              role="group"
              aria-label="編集モード"
            >
              <button
                type="button"
                onClick={() => onEditModeChange("internal")}
                className={cn(
                  "px-2 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1",
                  editMode === "internal"
                    ? "bg-amber-100 text-amber-800"
                    : "text-gray-600 hover:bg-gray-100"
                )}
                title="システム内で編集"
                aria-pressed={editMode === "internal"}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">内部</span>
              </button>
              <button
                type="button"
                onClick={() => onEditModeChange("external")}
                className={cn(
                  "px-2 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1",
                  editMode === "external"
                    ? "bg-slate-200 text-slate-800"
                    : "text-gray-600 hover:bg-gray-100"
                )}
                title="Excelで直接編集"
                aria-pressed={editMode === "external"}
              >
                <FileEdit className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">外部</span>
              </button>
            </div>

            {editMode === "internal" && (
              <label
                className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 flex-shrink-0"
                title="オンにするとサーバー上の Excel で保存し、画像・図形・グラフが保持されます。Windows 環境で Excel がインストールされている必要があります。"
              >
                <input
                  type="checkbox"
                  checked={useExcelInstance}
                  onChange={(e) => onUseExcelInstanceChange(e.target.checked)}
                  className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <span>
                  高忠実度保存 (Excel本体を使用)
                  <span className="text-xs text-gray-500 ml-0.5">— 画像・図形を保持</span>
                </span>
              </label>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={saving || (editMode === "internal" && pendingChangesCount === 0)}
              className={cn(
                "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium text-white transition-colors flex-shrink-0 text-sm sm:text-base",
                saving || (editMode === "internal" && pendingChangesCount === 0)
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-amber-600 hover:bg-amber-700"
              )}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-5 h-5 hidden sm:block" />
              )}
              <span>{editMode === "external" ? "ファイルの再検証・同期" : "保存"}</span>
              {editMode === "internal" && pendingChangesCount > 0 && (
                <span className="hidden sm:inline">({pendingChangesCount})</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
