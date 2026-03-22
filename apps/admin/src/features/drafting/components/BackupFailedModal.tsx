import { cn } from "@citadel/ui";
import type { BackupFailedModalState } from "@/features/drafting/hooks/useTemplateSync";

export interface BackupFailedModalProps {
  state: BackupFailedModalState;
  onClose: () => void;
  onContinue: (pendingNewFilePath?: string) => void;
  saving: boolean;
}

export function BackupFailedModal({ state, onClose, onContinue, saving }: BackupFailedModalProps) {
  if (!state.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-failed-modal-title"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-gray-200 p-4">
        <h2 id="backup-failed-modal-title" className="text-lg font-semibold text-gray-900 mb-2">
          バックアップの作成に失敗しました
        </h2>
        <p className="text-sm text-gray-600 mb-2">{state.message}</p>
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          {state.reason}
        </p>
        <p className="text-xs text-gray-500 mb-4">
          このまま続行すると、再検証・同期は行われますが、更新前のファイルのコピーは残りません。問題がなければ「続行」を選んでください。
        </p>
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
            onClick={() => onContinue(state.pendingNewFilePath)}
            disabled={saving}
            className={cn(
              "px-4 py-2 rounded-lg font-medium text-white",
              saving ? "bg-gray-400 cursor-not-allowed" : "bg-amber-600 hover:bg-amber-700"
            )}
          >
            {saving ? "処理中..." : "続行"}
          </button>
        </div>
      </div>
    </div>
  );
}
