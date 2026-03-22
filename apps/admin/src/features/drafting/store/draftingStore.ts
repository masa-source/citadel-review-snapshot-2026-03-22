import { create } from "zustand";
import type { RowArray, GridChange, MatchItem, MergeCellRange } from "@/features/drafting/types";
import { getMergedCoveredCells } from "@/features/drafting/utils/draftingTreeBuilders";
import type { MatchStrategy } from "@/features/drafting/utils/placeholderMatching";
import { apiClient } from "@/utils/api";

interface DraftingState {
  // Grid
  localData: RowArray[];
  pendingChanges: GridChange[];
  mergeCells: MergeCellRange[] | undefined;
  sheetName: string;

  setLocalData: (updater: RowArray[] | ((prev: RowArray[]) => RowArray[])) => void;
  setPendingChanges: (updater: GridChange[] | ((prev: GridChange[]) => GridChange[])) => void;
  setSheetContext: (sheetName: string, mergeCells: MergeCellRange[] | undefined) => void;
  recordChange: (row: number, col: number, value: string | number | null) => void;
  clearPendingChanges: () => void;

  // Tree/UI
  activeCell: [number, number] | null;
  openIds: Set<string>;
  recentlyUpdatedCells: Set<string>;
  setActiveCell: (cell: [number, number] | null) => void;
  setOpenIds: (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setRecentlyUpdatedCells: (cells: Set<string>) => void;

  // Matching
  matchModalOpen: boolean;
  matchResults: MatchItem[];
  matchChecked: boolean[];
  insertFeedback: string | null;
  setMatchModalOpen: (open: boolean) => void;
  setMatchResults: (items: MatchItem[]) => void;
  setMatchChecked: (updater: boolean[] | ((prev: boolean[]) => boolean[])) => void;
  setInsertFeedback: (msg: string | null) => void;

  // Actions
  insertPlaceholder: (placeholder: string) => { success: boolean; message: string };
  runMatchScan: (reportId: string, strategy: MatchStrategy) => Promise<void>;
  applyCheckedMatches: () => number;
}

export const useDraftingStore = create<DraftingState>((set, get) => ({
  localData: [],
  pendingChanges: [],
  mergeCells: undefined,
  sheetName: "",

  setLocalData: (arg) =>
    set((s) => ({
      localData: typeof arg === "function" ? arg(s.localData) : arg,
    })),
  setPendingChanges: (arg) =>
    set((s) => ({
      pendingChanges: typeof arg === "function" ? arg(s.pendingChanges) : arg,
    })),
  setSheetContext: (sheetName, mergeCells) => set({ sheetName, mergeCells }),
  recordChange: (row, col, value) =>
    set((s) => {
      const rest = s.pendingChanges.filter(
        (c) => !(c.sheetName === s.sheetName && c.row === row && c.col === col)
      );
      return {
        pendingChanges: [...rest, { sheetName: s.sheetName, row, col, value }],
      };
    }),
  clearPendingChanges: () => set({ pendingChanges: [] }),

  activeCell: null,
  openIds: new Set(),
  recentlyUpdatedCells: new Set(),
  setActiveCell: (cell) => set({ activeCell: cell }),
  setOpenIds: (arg) =>
    set((s) => ({
      openIds: typeof arg === "function" ? arg(s.openIds) : arg,
    })),
  setRecentlyUpdatedCells: (cells) => set({ recentlyUpdatedCells: cells }),

  matchModalOpen: false,
  matchResults: [],
  matchChecked: [],
  insertFeedback: null,
  setMatchModalOpen: (open) => set({ matchModalOpen: open }),
  setMatchResults: (items) =>
    set({
      matchResults: items,
      matchChecked: items.map(() => true),
    }),
  setMatchChecked: (arg) =>
    set((s) => ({
      matchChecked: typeof arg === "function" ? arg(s.matchChecked) : arg,
    })),
  setInsertFeedback: (msg) => set({ insertFeedback: msg }),

  insertPlaceholder: (placeholder) => {
    const { activeCell, mergeCells, setLocalData, recordChange, setOpenIds, setInsertFeedback } =
      get();
    if (activeCell == null) {
      const msg = "挿入先が選択されていません。ツリーでセルをクリックしてから挿入してください。";
      setInsertFeedback(msg);
      return { success: false, message: msg };
    }
    const [startRow, startCol] = activeCell;
    const merged = getMergedCoveredCells(mergeCells);
    if (merged.has(`${startRow},${startCol}`)) {
      const msg = "結合セル内のため編集できません。左上のセルを選択してください。";
      setInsertFeedback(msg);
      return { success: false, message: msg };
    }
    setLocalData((prev) => {
      const next = prev.map((r) => [...r]);
      while (next.length <= startRow) next.push([]);
      const row = next[startRow] as (string | number | null)[];
      while (row.length <= startCol) row.push(null);
      row[startCol] = placeholder;
      return next;
    });
    recordChange(startRow, startCol, placeholder);
    setOpenIds((prev) => new Set([...Array.from(prev), `row-${startRow}`]));
    const msg = `挿入しました: 行${startRow + 1}, 列${startCol + 1}`;
    setInsertFeedback(msg);
    return { success: true, message: msg };
  },

  runMatchScan: async (reportId, strategy) => {
    const {
      localData,
      mergeCells,
      sheetName,
      setMatchResults,
      setMatchChecked,
      setMatchModalOpen,
      setInsertFeedback,
    } = get();
    if (!reportId) {
      setInsertFeedback("レポートが選択されていません。");
      return;
    }
    try {
      const res = await apiClient.POST("/api/reports/{report_id}/match-scan", {
        params: { path: { report_id: reportId } },
        body: {
          sheetName,
          data: localData,
          mergeCells,
          strategy,
        },
      });
      const matches = (res.data ?? []) as MatchItem[];
      setMatchResults(matches);
      setMatchChecked(matches.map(() => true));
      setMatchModalOpen(true);
    } catch {
      setInsertFeedback("自動マッチングの実行中にエラーが発生しました。");
    }
  },

  applyCheckedMatches: () => {
    const {
      matchResults,
      matchChecked,
      setLocalData,
      recordChange,
      setOpenIds,
      setRecentlyUpdatedCells,
      setMatchModalOpen,
      setMatchResults,
      setMatchChecked,
      setInsertFeedback,
    } = get();
    const toApply = matchResults.filter((_, i) => matchChecked[i]);
    if (toApply.length === 0) {
      setMatchModalOpen(false);
      return 0;
    }
    setLocalData((prev) => {
      const next = prev.map((r) => [...r]);
      toApply.forEach(({ row, col, placeholder }) => {
        while (next.length <= row) next.push([]);
        const r = next[row] as (string | number | null)[];
        while (r.length <= col) r.push(null);
        r[col] = placeholder;
        recordChange(row, col, placeholder);
      });
      return next;
    });
    setOpenIds((prev) => {
      const next = new Set(Array.from(prev));
      toApply.forEach(({ row }) => next.add(`row-${row}`));
      return next;
    });
    setRecentlyUpdatedCells(new Set(toApply.map(({ row, col }) => `${row},${col}`)));
    setMatchModalOpen(false);
    setMatchResults([]);
    setMatchChecked([]);
    setInsertFeedback(`${toApply.length} 箇所をプレースホルダに置換しました。`);
    return toApply.length;
  },
}));
