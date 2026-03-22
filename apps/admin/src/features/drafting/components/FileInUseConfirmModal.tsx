import { cn } from "@citadel/ui";

export interface FileInUseConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
  saving: boolean;
}

export function FileInUseConfirmModal({
  open,
  onClose,
  onRetry,
  saving,
}: FileInUseConfirmModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-in-use-modal-title"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-gray-200 p-4">
        <h2 id="file-in-use-modal-title" className="text-lg font-semibold text-amber-900 mb-3">
          ファイルが開かれています
        </h2>
        <p className="text-sm text-gray-700 mb-4">
          この Excel ファイルは別のウィンドウや Excel
          で開かれている可能性があります。保存するには、そのファイルを閉じてから「再試行」を押してください。
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={onRetry}
            disabled={saving}
            className={cn(
              "px-4 py-2 rounded-lg font-medium text-white",
              saving ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"
            )}
          >
            {saving ? "保存中..." : "再試行"}
          </button>
        </div>
      </div>
    </div>
  );
}
