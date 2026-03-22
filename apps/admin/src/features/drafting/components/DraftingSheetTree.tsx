import { useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { TreeView } from "@/components/TreeView";
import { DraftingCellRow } from "@/features/drafting/components/DraftingCellRow";
import type { DraftingCellData } from "@/features/drafting/utils/draftingTreeBuilders";
import { replacePlaceholdersInCell, getColumnLetter } from "@/features/drafting/utils/cellFormat";
import type { TreeNode } from "@/components/TreeView";

const PREVIEW_ERROR_LABEL = "[解決エラー]";

function getPreviewValue(value: string | number | null, contextData: unknown): string {
  try {
    const result = replacePlaceholdersInCell(value, contextData);
    return result == null ? "" : String(result);
  } catch {
    return PREVIEW_ERROR_LABEL;
  }
}

export interface DraftingSheetTreeProps {
  treeNodes: TreeNode<DraftingCellData>[];
  openIds: Set<string>;
  onOpenChange: (openIds: Set<string>) => void;
  activeCell: [number, number] | null;
  onActiveCellChange: (row: number, col: number) => void;
  onCellChange: (row: number, col: number, value: string | number | null) => void;
  contextData: unknown;
  gridLoading: boolean;
  gridError: unknown;
  currentSheet: { name: string } | undefined;
  sheets: { name: string }[];
  currentSheetIndex: number;
  onCurrentSheetIndexChange: (index: number) => void;
  sheetNameMismatch?: boolean;
  storedSheetNames?: string[];
  currentSheetNames?: string[];
  editMode: "internal" | "external";
  recentlyUpdatedCells?: Set<string>;
}

export function DraftingSheetTree({
  treeNodes,
  openIds,
  onOpenChange,
  activeCell,
  onActiveCellChange,
  onCellChange,
  contextData,
  gridLoading,
  gridError,
  currentSheet,
  sheets,
  currentSheetIndex,
  onCurrentSheetIndexChange,
  sheetNameMismatch,
  storedSheetNames,
  currentSheetNames,
  editMode,
  recentlyUpdatedCells,
}: DraftingSheetTreeProps) {
  const handleCellChange = useCallback(
    (row: number, col: number, value: string | number | null) => {
      onCellChange(row, col, value);
    },
    [onCellChange]
  );

  const handleCellFocus = useCallback(
    (row: number, col: number) => {
      onActiveCellChange(row, col);
    },
    [onActiveCellChange]
  );

  const renderLeaf = useCallback(
    (data: DraftingCellData) => {
      const previewValue = getPreviewValue(data.value, contextData);
      const isActive =
        activeCell !== null && activeCell[0] === data.row && activeCell[1] === data.col;
      const cellKey = `${data.row},${data.col}`;
      const isRecentlyUpdated = recentlyUpdatedCells?.has(cellKey) ?? false;
      const address = `${getColumnLetter(data.col)}${data.row + 1}`;

      return (
        <DraftingCellRow
          row={data.row}
          col={data.col}
          value={data.value}
          cellAddress={address}
          isActive={isActive}
          previewValue={previewValue}
          isRecentlyUpdated={isRecentlyUpdated}
          onChange={handleCellChange}
          onFocus={handleCellFocus}
          disabled={editMode === "external"}
        />
      );
    },
    [contextData, activeCell, recentlyUpdatedCells, handleCellChange, handleCellFocus, editMode]
  );

  const getFolderTestId = useCallback((node: TreeNode<DraftingCellData>) => {
    if (node.id.startsWith("row-")) {
      const rowIndex = node.id.replace("row-", "");
      return `drafting-row-${rowIndex}`;
    }
    return undefined;
  }, []);

  if (editMode === "external") {
    return (
      <div className="flex-1 flex items-center justify-center p-8 min-h-[300px]">
        <div className="max-w-md text-center space-y-4">
          <p className="text-slate-700">
            現在、外部ファイル編集モードです。Excelでファイルを編集・保存した後、以下のボタンで検証を行ってください。
          </p>
          <p className="text-sm text-slate-500">
            ヘッダーの「ファイルの再検証・同期」をクリックすると、サーバー上のファイルを検疫し、問題がないか確認します。
          </p>
          <div className="mt-6 pt-4 border-t border-slate-200 text-left">
            <p className="text-xs font-medium text-amber-800 mb-2">注意事項</p>
            <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
              <li>シート名を変更しないでください。</li>
              <li>
                印刷範囲（改ページ）はExcelの「印刷プレビュー」で確認・調整してから保存してください。
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {sheetNameMismatch && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">シート名が変更されています。</p>
            <p className="text-xs text-amber-800 mt-1">
              登録時: {storedSheetNames?.join(", ") ?? "—"} → 現在:{" "}
              {currentSheetNames?.join(", ") ?? "—"}
            </p>
            <p className="text-xs mt-1">
              シート名を変更するとレポート生成でデータが流し込まれない場合があります。元の名前に戻すか、運用で統一してください。
            </p>
          </div>
        </div>
      )}
      <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        {sheets.length > 1 ? (
          <select
            value={currentSheetIndex}
            onChange={(e) => onCurrentSheetIndexChange(Number(e.target.value))}
            className="text-sm font-medium border border-gray-300 rounded-lg px-2 py-1"
          >
            {sheets.map((s, i) => (
              <option key={s.name} value={i}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-medium text-gray-700">
            {currentSheet?.name ?? "シート"}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-[300px] overflow-auto" data-testid="drafting-sheet-tree">
        {gridLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
          </div>
        ) : gridError ? (
          <div className="flex items-center justify-center h-full text-red-600">
            グリッドの読み込みに失敗しました。
          </div>
        ) : currentSheet && treeNodes.length >= 0 ? (
          <div key={currentSheet.name} className="p-2">
            <TreeView<DraftingCellData>
              nodes={treeNodes}
              renderLeaf={renderLeaf}
              openIds={openIds}
              onOpenChange={onOpenChange}
              getFolderTestId={getFolderTestId}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            シートがありません。
          </div>
        )}
      </div>
    </>
  );
}
