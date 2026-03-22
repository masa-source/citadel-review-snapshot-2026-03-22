import { cn } from "@citadel/ui";
import type { MatchItem } from "@/features/drafting/types";

export interface MatchResultModalProps {
  open: boolean;
  onClose: () => void;
  matchResults: MatchItem[];
  matchChecked: boolean[];
  onMatchCheckedChange: (index: number, checked: boolean) => void;
  onApply: () => void;
}

export function MatchResultModal({
  open,
  onClose,
  matchResults,
  matchChecked,
  onMatchCheckedChange,
  onApply,
}: MatchResultModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-modal-title"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 id="match-modal-title" className="text-lg font-semibold text-gray-900">
            自動マッチング結果の確認
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
        <div className="px-4 py-2 text-sm text-gray-600 border-b border-gray-100">
          以下のセルをプレースホルダに置換します。不要な行のチェックを外してから「適用」を押してください。
        </div>
        <div className="flex-1 overflow-auto p-4 min-h-0">
          {matchResults.length === 0 ? (
            <p className="text-gray-500 text-sm">一致したセルはありません。</p>
          ) : (
            <ul className="space-y-2">
              {matchResults.map((m, i) => (
                <li
                  key={`${m.row}-${m.col}`}
                  className={cn(
                    "flex items-center gap-3 py-2 px-3 rounded-lg border",
                    matchChecked[i]
                      ? "bg-amber-50/80 border-amber-200"
                      : "bg-gray-50 border-gray-200"
                  )}
                >
                  <input
                    type="checkbox"
                    id={`match-${i}`}
                    checked={matchChecked[i]}
                    onChange={() => onMatchCheckedChange(i, !matchChecked[i])}
                    className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <label
                    htmlFor={`match-${i}`}
                    className="flex-1 min-w-0 flex items-center gap-2 flex-wrap cursor-pointer"
                  >
                    <span
                      className="font-mono text-sm text-gray-700 truncate max-w-[140px]"
                      title={m.currentValue}
                    >
                      {m.currentValue}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span
                      className="font-mono text-sm text-amber-700 break-all"
                      title={m.placeholder}
                    >
                      {m.placeholder}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0">
                      (行: {m.row + 1}, 列: {m.col + 1})
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={matchResults.length === 0 || !matchChecked.some(Boolean)}
            className={cn(
              "px-4 py-2 rounded-lg font-medium text-white",
              matchChecked.some(Boolean)
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-gray-400 cursor-not-allowed"
            )}
          >
            適用
          </button>
        </div>
      </div>
    </div>
  );
}
