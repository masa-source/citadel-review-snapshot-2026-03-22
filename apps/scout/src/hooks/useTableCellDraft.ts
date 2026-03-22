import { useCallback, useMemo, useState } from "react";

export type TableCellDraftKeyParams = {
  tableId: string;
  rowIndex: number;
  colKey: string;
};

export function buildTableCellDraftKey({ tableId, rowIndex, colKey }: TableCellDraftKeyParams) {
  return `${tableId}::${rowIndex}::${colKey}`;
}

export function applyDraftToRows(params: {
  rows: Record<string, unknown>[];
  rowIndex: number;
  colKey: string;
  value: string;
}): Record<string, unknown>[] {
  const { rows, rowIndex, colKey, value } = params;
  const row = rows[rowIndex];
  if (!row) return rows;
  const next = [...rows];
  next[rowIndex] = { ...row, [colKey]: value };
  return next;
}

export function useTableCellDraft() {
  const [draftByKey, setDraftByKey] = useState<Record<string, string>>({});

  const getDraft = useCallback(
    (params: TableCellDraftKeyParams): string | undefined => {
      return draftByKey[buildTableCellDraftKey(params)];
    },
    [draftByKey]
  );

  const setDraft = useCallback((params: TableCellDraftKeyParams, value: string) => {
    const key = buildTableCellDraftKey(params);
    setDraftByKey((prev) => {
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  }, []);

  const clearCell = useCallback((params: TableCellDraftKeyParams) => {
    const key = buildTableCellDraftKey(params);
    setDraftByKey((prev) => {
      if (!(key in prev)) return prev;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [key]: _omit, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearTable = useCallback((tableId: string) => {
    setDraftByKey((prev) => {
      const prefix = `${tableId}::`;
      let changed = false;
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (k.startsWith(prefix)) {
          changed = true;
          continue;
        }
        next[k] = v;
      }
      return changed ? next : prev;
    });
  }, []);

  const clearAll = useCallback(() => setDraftByKey({}), []);

  const hasAnyDraft = useMemo(() => Object.keys(draftByKey).length > 0, [draftByKey]);

  return {
    getDraft,
    setDraft,
    clearCell,
    clearTable,
    clearAll,
    hasAnyDraft,
  };
}
