import { cn } from "@citadel/ui";

export interface OverwriteConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmOverwrite: () => void;
  saving: boolean;
}

export function OverwriteConfirmModal({
  open,
  onClose,
  onConfirmOverwrite,
  saving,
}: OverwriteConfirmModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="overwrite-confirm-modal-title"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-gray-200 p-4">
        <h2
          id="overwrite-confirm-modal-title"
          className="text-lg font-semibold text-amber-900 mb-3"
        >
          ファイルが変更されています
        </h2>
        <p className="text-sm text-gray-700 mb-2">
          ファイルが外部（Excel など）で変更されています。このまま保存すると、その変更は
          <strong>上書き</strong>されます。
        </p>
        <p className="text-sm text-gray-600 mb-4">
          上書きせずに外部の変更を取り込みたい場合は、一度「外部」モードに切り替え、「ファイルの再検証・同期」で取り込んでから「内部」モードに戻してください。その場合、今まで内部で編集した内容は
          <strong>リセット</strong>されます。
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
            onClick={onConfirmOverwrite}
            disabled={saving}
            className={cn(
              "px-4 py-2 rounded-lg font-medium text-white",
              saving ? "bg-gray-400 cursor-not-allowed" : "bg-amber-600 hover:bg-amber-700"
            )}
          >
            {saving ? "保存中..." : "上書き保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}
