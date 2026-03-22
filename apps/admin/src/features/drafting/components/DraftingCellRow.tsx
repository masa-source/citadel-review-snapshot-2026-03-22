import { memo } from "react";
import { cn } from "@citadel/ui";

export interface DraftingCellRowProps {
  row: number;
  col: number;
  value: string | number | null;
  cellAddress: string;
  isActive: boolean;
  previewValue: string;
  isRecentlyUpdated?: boolean;
  onChange: (row: number, col: number, value: string | number | null) => void;
  onFocus: (row: number, col: number) => void;
  disabled?: boolean;
}

function DraftingCellRowComponent({
  row,
  col,
  value,
  cellAddress,
  isActive,
  previewValue,
  isRecentlyUpdated,
  onChange,
  onFocus,
  disabled,
}: DraftingCellRowProps) {
  const displayValue = value === null || value === undefined ? "" : String(value);

  return (
    <div
      className={cn(
        "flex items-center gap-2 w-full min-w-0 py-1 pr-2",
        isRecentlyUpdated && "bg-green-50",
        isActive && "ring-1 ring-amber-400 rounded"
      )}
    >
      <span className="shrink-0 text-xs font-mono text-gray-500 w-10" title={cellAddress}>
        {cellAddress}
      </span>
      <input
        type="text"
        value={displayValue}
        onChange={(e) => {
          const v = e.target.value;
          onChange(row, col, v === "" ? null : v);
        }}
        onFocus={() => onFocus(row, col)}
        disabled={disabled}
        className="min-w-0 flex-1 max-w-[200px] px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
        data-testid={`drafting-cell-${row}-${col}`}
        data-cell-row={row}
        data-cell-col={col}
        aria-label={`セル ${cellAddress}`}
      />
      <span
        className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-gray-600 truncate"
        title={previewValue}
        aria-label={previewValue.length > 50 ? `プレビュー: ${previewValue}` : undefined}
      >
        {previewValue || "—"}
      </span>
    </div>
  );
}

export const DraftingCellRow = memo(DraftingCellRowComponent);
