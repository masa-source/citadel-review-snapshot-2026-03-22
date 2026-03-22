import { useCallback, useEffect, useMemo } from "react";
import type { SheetData } from "@/features/drafting/types";
import type { DraftingCellData } from "@/features/drafting/utils/draftingTreeBuilders";
import {
  buildDraftingTree,
  getDefaultOpenRowIds,
  getMergedCoveredCells,
} from "@/features/drafting/utils/draftingTreeBuilders";
import { useDraftingStore } from "@/features/drafting/store";

export interface UseDraftingTreeArgs {
  currentSheet: SheetData | undefined;
}

export function useDraftingTree({ currentSheet }: UseDraftingTreeArgs) {
  const localData = useDraftingStore((s) => s.localData);
  const setLocalData = useDraftingStore((s) => s.setLocalData);
  const pendingChanges = useDraftingStore((s) => s.pendingChanges);
  const setPendingChanges = useDraftingStore((s) => s.setPendingChanges);
  const recordChange = useDraftingStore((s) => s.recordChange);
  const activeCell = useDraftingStore((s) => s.activeCell);
  const setActiveCell = useDraftingStore((s) => s.setActiveCell);
  const openIds = useDraftingStore((s) => s.openIds);
  const setOpenIds = useDraftingStore((s) => s.setOpenIds);
  const setSheetContext = useDraftingStore((s) => s.setSheetContext);

  const mergedCoveredCells = useMemo(
    () => getMergedCoveredCells(currentSheet?.mergeCells),
    [currentSheet?.mergeCells]
  );

  const handleCellChange = useCallback(
    (row: number, col: number, value: string | number | null) => {
      setLocalData((prev) => {
        const next = prev.map((r) => [...r]);
        while (next.length <= row) next.push([]);
        const rowArr = next[row] as (string | number | null)[];
        while (rowArr.length <= col) rowArr.push(null);
        rowArr[col] = value;
        return next;
      });
      recordChange(row, col, value);
    },
    [setLocalData, recordChange]
  );

  const treeNodes = useMemo(
    () => buildDraftingTree(localData, currentSheet?.mergeCells),
    [localData, currentSheet?.mergeCells]
  );

  const defaultOpenRowIds = useMemo(
    () => getDefaultOpenRowIds(localData, currentSheet?.mergeCells),
    [localData, currentSheet?.mergeCells]
  );

  useEffect(() => {
    if (currentSheet) {
      const maxCols = Math.max(
        ...(currentSheet.data.map((r) => r.length) as number[]),
        currentSheet.col_metadata?.length ?? 0,
        1
      );
      const normalized = currentSheet.data.length
        ? currentSheet.data.map((row) => {
            const r = [...row];
            while (r.length < maxCols) r.push(null);
            return r;
          })
        : [];
      setSheetContext(currentSheet.name, currentSheet.mergeCells);
      setLocalData(normalized);
      setOpenIds(new Set());
    }
  }, [currentSheet, setSheetContext, setLocalData, setOpenIds]);

  return {
    localData,
    setLocalData,
    pendingChanges,
    setPendingChanges,
    recordChange,
    activeCell,
    setActiveCell,
    openIds,
    setOpenIds,
    treeNodes,
    defaultOpenRowIds,
    mergedCoveredCells,
    handleCellChange,
  };
}

export type { DraftingCellData };
