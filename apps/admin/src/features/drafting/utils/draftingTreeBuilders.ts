/**
 * 簡易設計台: 2次元配列＋結合情報から「表示対象セルのみ」のツリー用データを構築する。
 * 空セル・結合の非左上は除外。行サマリーは文字数・項目数上限で丸める。
 */

import type { TreeNode } from "@/components/TreeView";
import type { MergeCellRange, RowArray } from "@/features/drafting/types";
import { getColumnLetter } from "@/features/drafting/utils/cellFormat";

/** セルノードの data。リーフで保持する。 */
export interface DraftingCellData {
  row: number;
  col: number;
  value: string | number | null;
}

/** 行サマリーの上限 */
const ROW_SUMMARY_MAX_CHARS = 60;
const ROW_SUMMARY_MAX_ITEMS = 5;
const ROW_SUMMARY_SEPARATOR = ", ";

/**
 * 結合セルの「左上以外」の座標セット "row,col" を返す。
 */
export function getMergedCoveredCells(mergeCells: MergeCellRange[] | undefined): Set<string> {
  const set = new Set<string>();
  (mergeCells ?? []).forEach((m) => {
    for (let r = m.row; r < m.row + m.rowspan; r++) {
      for (let c = m.col; c < m.col + m.colspan; c++) {
        if (r !== m.row || c !== m.col) set.add(`${r},${c}`);
      }
    }
  });
  return set;
}

/**
 * 値が「空」か（null / undefined / 空文字）。
 */
function isEmptyCell(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  return String(value).trim() === "";
}

/**
 * 行のセル値からサマリー文字列を生成。文字数・項目数上限で丸める。
 */
function buildRowSummary(
  cellValues: (string | number | null)[],
  maxChars: number,
  maxItems: number
): string {
  const parts: string[] = [];
  for (const v of cellValues) {
    if (parts.length >= maxItems) break;
    const s = v == null ? "" : String(v).trim();
    if (s) parts.push(s);
  }
  let joined = parts.join(ROW_SUMMARY_SEPARATOR);
  if (joined.length > maxChars) {
    joined = joined.slice(0, maxChars) + "...";
  }
  return joined;
}

/**
 * localData（RowArray[]）と mergeCells から、表示対象セルのみを抽出し、
 * 行でグループ化したうえで TreeNode のツリー（ルートの子＝行ノード、行ノードの子＝セルノード）を構築する。
 * 行ノードの label は "行 N (サマリー)" 形式。サマリーは上限付き。
 */
export function buildDraftingTree(
  localData: RowArray[],
  mergeCells: MergeCellRange[] | undefined
): TreeNode<DraftingCellData>[] {
  const mergedCovered = getMergedCoveredCells(mergeCells);
  const cells: { row: number; col: number; value: string | number | null }[] = [];

  for (let row = 0; row < localData.length; row++) {
    const rowData = localData[row] ?? [];
    for (let col = 0; col < rowData.length; col++) {
      if (mergedCovered.has(`${row},${col}`)) continue;
      const value = rowData[col] ?? null;
      if (isEmptyCell(value)) continue;
      cells.push({ row, col, value });
    }
  }

  // 行でグループ化（row 昇順、同 row 内は col 昇順）
  const byRow = new Map<number, { col: number; value: string | number | null }[]>();
  for (const c of cells) {
    const list = byRow.get(c.row) ?? [];
    list.push({ col: c.col, value: c.value });
    byRow.set(c.row, list);
  }
  Array.from(byRow.values()).forEach((list) => list.sort((a, b) => a.col - b.col));

  const rowIndices = Array.from(byRow.keys()).sort((a, b) => a - b);
  const rowNodes: TreeNode<DraftingCellData>[] = [];

  for (const rowIndex of rowIndices) {
    const cellList = byRow.get(rowIndex)!;
    const summaryValues = cellList.map((c) => c.value);
    const summary = buildRowSummary(summaryValues, ROW_SUMMARY_MAX_CHARS, ROW_SUMMARY_MAX_ITEMS);
    const rowLabel = summary ? `行 ${rowIndex + 1} (${summary})` : `行 ${rowIndex + 1}`;

    const cellNodes: TreeNode<DraftingCellData>[] = cellList.map(({ col, value }) => ({
      id: `cell-${rowIndex}-${col}`,
      label: `${getColumnLetter(col)}${rowIndex + 1}`,
      data: { row: rowIndex, col, value },
    }));

    rowNodes.push({
      id: `row-${rowIndex}`,
      label: rowLabel,
      leafCount: cellNodes.length,
      children: cellNodes,
    });
  }

  return rowNodes;
}

/**
 * 全行ノードの id の Set（初期展開用 defaultOpenIds）。
 */
export function getDefaultOpenRowIds(
  localData: RowArray[],
  mergeCells: MergeCellRange[] | undefined
): Set<string> {
  const mergedCovered = getMergedCoveredCells(mergeCells);
  const rowIds = new Set<string>();

  for (let row = 0; row < localData.length; row++) {
    const rowData = localData[row] ?? [];
    let hasVisibleCell = false;
    for (let col = 0; col < rowData.length; col++) {
      if (mergedCovered.has(`${row},${col}`)) continue;
      const value = rowData[col] ?? null;
      if (!isEmptyCell(value)) {
        hasVisibleCell = true;
        break;
      }
    }
    if (hasVisibleCell) rowIds.add(`row-${row}`);
  }
  return rowIds;
}
