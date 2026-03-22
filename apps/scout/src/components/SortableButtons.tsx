import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@citadel/ui";

export interface SortableButtonsProps {
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  /** 外側の wrapper のクラス名 (フレックス方向や余白の調整用) */
  className?: string;
  /** 各ボタンに適用されるクラス名 (高さや色などの調整) */
  buttonClassName?: string;
  /** アイコンに適用されるクラス名 (アイコンサイズの調整など) */
  iconClassName?: string;
}

export function SortableButtons({
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  className,
  buttonClassName,
  iconClassName,
}: SortableButtonsProps) {
  return (
    <div className={cn("flex", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMoveUp();
        }}
        disabled={isFirst}
        className={cn(
          "flex items-center justify-center rounded transition-colors hover:bg-gray-100 disabled:opacity-40",
          buttonClassName || "min-h-[36px] min-w-[36px] text-gray-600"
        )}
        aria-label="上へ"
      >
        <ChevronUp className={cn("h-4 w-4", iconClassName)} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMoveDown();
        }}
        disabled={isLast}
        className={cn(
          "flex items-center justify-center rounded transition-colors hover:bg-gray-100 disabled:opacity-40",
          buttonClassName || "min-h-[36px] min-w-[36px] text-gray-600"
        )}
        aria-label="下へ"
      >
        <ChevronDown className={cn("h-4 w-4", iconClassName)} />
      </button>
    </div>
  );
}
