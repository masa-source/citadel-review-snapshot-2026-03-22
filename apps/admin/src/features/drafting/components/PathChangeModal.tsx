import { cn } from "@citadel/ui";
import type { PathChangeModalState } from "@/features/drafting/hooks/useTemplateSync";

export interface PathChangeModalProps {
  state: PathChangeModalState;
  onClose: () => void;
  onNewPathChange: (newPath: string) => void;
  onSubmit: () => void;
  saving: boolean;
}

export function PathChangeModal({
  state,
  onClose,
  onNewPathChange,
  onSubmit,
  saving,
}: PathChangeModalProps) {
  if (!state.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="path-change-modal-title"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-gray-200 p-4">
        <h2 id="path-change-modal-title" className="text-lg font-semibold text-gray-900 mb-2">
          ファイルが見つかりません
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          パスを変更しますか？ 正しい相対パス（例:
          template-local/ファイル名.xlsx）を入力してください。
        </p>
        {state.currentPath && (
          <p className="text-xs text-gray-500 mb-2 font-mono truncate" title={state.currentPath}>
            現在のパス: {state.currentPath}
          </p>
        )}
        <input
          type="text"
          value={state.newPath}
          onChange={(e) => onNewPathChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono mb-4"
          placeholder="例: template-local/Report.xlsx"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving || !state.newPath.trim()}
            className={cn(
              "px-4 py-2 rounded-lg font-medium text-white",
              saving || !state.newPath.trim()
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-amber-600 hover:bg-amber-700"
            )}
          >
            {saving ? "検証中..." : "再試行"}
          </button>
        </div>
      </div>
    </div>
  );
}
