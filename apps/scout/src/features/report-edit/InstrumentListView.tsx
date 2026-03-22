import { Plus, Trash2, Wrench } from "lucide-react";
import { SortableButtons } from "@/components/SortableButtons";
import type { TargetInstrument } from "@citadel/types";

export interface InstrumentListViewProps {
  targetInstruments: TargetInstrument[] | undefined;
  onAdd: () => void;
  onSelect: (instrumentId: string) => void;
  onMoveUp?: (instrumentId: string) => void;
  onMoveDown?: (instrumentId: string) => void;
  onDelete?: (instrumentId: string) => void;
  isReadOnly?: boolean;
}

export function InstrumentListView({
  targetInstruments,
  onAdd,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  isReadOnly = false,
}: InstrumentListViewProps): React.ReactElement {
  return (
    <section className="mt-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <Wrench className="h-5 w-5" />
          対象機器一覧
        </h2>
        {!isReadOnly && (
          <button
            type="button"
            onClick={onAdd}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-base font-medium text-white hover:bg-green-700 active:bg-green-800"
          >
            <Plus className="h-5 w-5" />
            機器を追加
          </button>
        )}
      </div>
      {!targetInstruments ? (
        <p className="py-4 text-center text-sm text-gray-500">読み込み中...</p>
      ) : targetInstruments.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          対象機器がありません。「機器を追加」から登録してください。
        </p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {targetInstruments.map((ti, index) => (
            <li key={ti.id} className="flex items-center gap-1">
              {!isReadOnly && onMoveUp && onMoveDown ? (
                <SortableButtons
                  onMoveUp={() => {
                    if (ti.id) onMoveUp(ti.id);
                  }}
                  onMoveDown={() => {
                    if (ti.id) onMoveDown(ti.id);
                  }}
                  isFirst={index <= 0}
                  isLast={index >= targetInstruments!.length - 1}
                  className="shrink-0 flex-col"
                />
              ) : null}
              <button
                type="button"
                onClick={() => ti.id != null && onSelect(ti.id)}
                className="flex min-h-[48px] flex-1 flex-col gap-1 px-3 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="font-medium text-gray-900 sm:w-28 shrink-0">
                  {ti.tagNumber ?? "—"}
                </span>
                <span className="flex-1 truncate text-gray-700">—</span>
              </button>
              {!isReadOnly && onDelete && ti.id ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(ti.id!);
                  }}
                  className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded text-red-600 hover:bg-red-50 active:bg-red-100"
                  aria-label="削除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
