import { useCallback, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2, Table2, ChevronRight } from "lucide-react";
import { SortableButtons } from "@/components/SortableButtons";

import { getRepository } from "@/services/data";
import type { TargetInstrumentTable } from "@citadel/types";
import { generateUUID } from "@/utils/uuid";
import { applyDraftToRows, useTableCellDraft } from "@/hooks/useTableCellDraft";

type Props = {
  targetInstrumentId: string;
  reportId: string;
};

export function TargetInstrumentTablesForm({ targetInstrumentId, reportId }: Props) {
  const titRepo = getRepository("targetInstrumentTables");
  const tdRepo = getRepository("tableDefinitions");

  const tables = useLiveQuery(
    () => titRepo.getByTargetInstrumentId(targetInstrumentId),
    [targetInstrumentId, titRepo]
  );

  const tableDefinitions = useLiveQuery(() => tdRepo.list(), [tdRepo]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const cellDraft = useTableCellDraft();

  const handleAdd = useCallback(async () => {
    const list = await titRepo.getByTargetInstrumentId(targetInstrumentId);
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((t) => t.sortOrder ?? 0));
    const newId = generateUUID();
    await titRepo.add({
      id: newId,
      targetInstrumentId,
      tableDefinitionId: undefined,
      reportId,
      roleKey: "",
      sortOrder: maxOrder + 1,
      rows: [],
    } as unknown as TargetInstrumentTable);
    setExpandedId(newId);
  }, [targetInstrumentId, reportId, titRepo]);

  const handleDelete = useCallback(
    async (id: string) => {
      cellDraft.clearTable(id);
      await titRepo.delete(id);
      await titRepo.reorderSortOrder(targetInstrumentId);
      if (expandedId === id) setExpandedId(null);
    },
    [cellDraft, targetInstrumentId, titRepo, expandedId]
  );

  const handleMoveUp = useCallback(
    async (id: string) => {
      const list = await titRepo.getByTargetInstrumentId(targetInstrumentId);
      const i = list.findIndex((t) => t.id === id);
      if (i <= 0) return;
      await titRepo.swapSortOrder(targetInstrumentId, i, "up");
    },
    [targetInstrumentId, titRepo]
  );

  const handleMoveDown = useCallback(
    async (id: string) => {
      const list = await titRepo.getByTargetInstrumentId(targetInstrumentId);
      const i = list.findIndex((t) => t.id === id);
      if (i < 0 || i >= list.length - 1) return;
      await titRepo.swapSortOrder(targetInstrumentId, i, "down");
    },
    [targetInstrumentId, titRepo]
  );

  const handleTableDefChange = useCallback(
    async (id: string, value: string) => {
      const table = tables?.find((t) => t.id === id);
      const selectedTd = value ? tableDefinitions?.find((d) => d.id === value) : undefined;
      const defaultRoleKey =
        table && !table.roleKey && selectedTd && (selectedTd as { roleKey?: string }).roleKey
          ? (selectedTd as { roleKey?: string }).roleKey
          : undefined;
      cellDraft.clearTable(id);
      await titRepo.update(id, {
        tableDefinitionId: value || undefined,
        ...(defaultRoleKey != null ? { roleKey: defaultRoleKey } : {}),
      });
    },
    [cellDraft, titRepo, tables, tableDefinitions]
  );

  const handleRoleKeyChange = useCallback(
    async (id: string, value: string) => {
      await titRepo.update(id, { roleKey: value || undefined });
    },
    [titRepo]
  );

  const getColumnDefs = useCallback(
    (tableDefId: string | null | undefined) => {
      if (!tableDefId || !tableDefinitions) return [];
      const td = tableDefinitions.find((d) => d.id === tableDefId);
      return (td?.columns as { key: string; name: string }[] | null) ?? [];
    },
    [tableDefinitions]
  );

  const handleRowAdd = useCallback(
    async (tableId: string, tableDefId: string | null | undefined) => {
      const table = tables?.find((t) => t.id === tableId);
      if (!table) return;
      const cols = getColumnDefs(tableDefId);
      const emptyRow: Record<string, string> = {};
      for (const col of cols) {
        emptyRow[col.key] = "";
      }
      const currentRows = (table.rows as Record<string, unknown>[]) ?? [];
      cellDraft.clearTable(tableId);
      await titRepo.update(tableId, { rows: [...currentRows, emptyRow] });
    },
    [cellDraft, tables, titRepo, getColumnDefs]
  );

  const handleRowDelete = useCallback(
    async (tableId: string, rowIndex: number) => {
      const table = tables?.find((t) => t.id === tableId);
      if (!table) return;
      const currentRows = (table.rows as Record<string, unknown>[]) ?? [];
      const newRows = currentRows.filter((_, i) => i !== rowIndex);
      cellDraft.clearTable(tableId);
      await titRepo.update(tableId, { rows: newRows });
    },
    [cellDraft, tables, titRepo]
  );

  const handleCellCommit = useCallback(
    async (tableId: string, rowIndex: number, colKey: string, value: string) => {
      const table = tables?.find((t) => t.id === tableId);
      if (!table) return;
      const currentRows = ((table.rows as Record<string, unknown>[]) ?? []) as Record<
        string,
        unknown
      >[];
      const nextRows = applyDraftToRows({ rows: currentRows, rowIndex, colKey, value });
      if (nextRows === currentRows) return;
      await titRepo.update(tableId, { rows: nextRows });
    },
    [tables, titRepo]
  );

  if (tables === undefined || tableDefinitions === undefined) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        表データを読み込み中...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
        <Table2 className="h-5 w-5 text-gray-500" />
        表データ
      </h2>

      {tables.length === 0 ? (
        <p className="text-sm text-gray-500">
          表データがありません。「表を追加」から登録してください。
        </p>
      ) : (
        <div className="space-y-3">
          {tables.map((tit, idx) => {
            const isExpanded = expandedId === tit.id;
            const tableDef = tableDefinitions.find((d) => d.id === tit.tableDefinitionId);
            const cols = getColumnDefs(tit.tableDefinitionId);
            const rows = (tit.rows as Record<string, unknown>[]) ?? [];

            return (
              <div key={tit.id} className="rounded-lg border border-gray-200 bg-white">
                {/* Header */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <SortableButtons
                    onMoveUp={() => tit.id != null && handleMoveUp(tit.id)}
                    onMoveDown={() => tit.id != null && handleMoveDown(tit.id)}
                    isFirst={idx <= 0}
                    isLast={idx >= tables.length - 1}
                    className="shrink-0 flex-col"
                    buttonClassName="h-7 w-7 text-gray-500 disabled:opacity-30"
                  />

                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : (tit.id ?? null))}
                    className="flex min-h-[40px] flex-1 items-center gap-2 text-left"
                  >
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                    <span className="text-sm font-medium text-gray-800">
                      {tableDef?.name ?? "（未選択）"}
                    </span>
                    {tit.roleKey && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                        {tit.roleKey}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{rows.length}行</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => tit.id != null && handleDelete(tit.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-red-500 hover:bg-red-50"
                    aria-label="表を削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-3 py-3 space-y-3">
                    {/* Table def & role key */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          表定義
                        </label>
                        <select
                          value={tit.tableDefinitionId ? String(tit.tableDefinitionId) : ""}
                          onChange={(e) =>
                            tit.id != null && handleTableDefChange(tit.id, e.target.value)
                          }
                          className="min-h-[40px] w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">— 表定義を選択 —</option>
                          {tableDefinitions.map((td) => (
                            <option key={td.id} value={td.id ?? ""}>
                              {td.name ?? "—"}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          役割キー
                        </label>
                        <input
                          type="text"
                          value={tit.roleKey ?? ""}
                          onChange={(e) =>
                            tit.id != null && handleRoleKeyChange(tit.id, e.target.value)
                          }
                          placeholder="例: pressure_measurement"
                          className="min-h-[40px] w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Rows table */}
                    {cols.length > 0 ? (
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="w-10 border border-gray-200 px-2 py-1.5 text-center text-xs font-medium text-gray-500">
                                #
                              </th>
                              {cols.map((col) => (
                                <th
                                  key={col.key}
                                  className="border border-gray-200 px-2 py-1.5 text-left text-xs font-medium text-gray-700"
                                >
                                  {col.name}
                                </th>
                              ))}
                              <th className="w-10 border border-gray-200 px-2 py-1.5" />
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, rowIdx) => (
                              <tr key={rowIdx} className="bg-white">
                                <td className="border border-gray-200 px-2 py-1 text-center text-xs text-gray-400">
                                  {rowIdx + 1}
                                </td>
                                {cols.map((col) => (
                                  <td key={col.key} className="border border-gray-200 p-0">
                                    <input
                                      type="text"
                                      className="min-h-[36px] w-full min-w-[80px] border-0 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      value={
                                        cellDraft.getDraft({
                                          tableId: String(tit.id ?? ""),
                                          rowIndex: rowIdx,
                                          colKey: col.key,
                                        }) ?? String(row[col.key] ?? "")
                                      }
                                      onChange={(e) =>
                                        tit.id != null &&
                                        cellDraft.setDraft(
                                          { tableId: tit.id, rowIndex: rowIdx, colKey: col.key },
                                          e.target.value
                                        )
                                      }
                                      onBlur={(e) => {
                                        if (tit.id == null) return;
                                        const value = e.target.value;
                                        cellDraft.clearCell({
                                          tableId: tit.id,
                                          rowIndex: rowIdx,
                                          colKey: col.key,
                                        });
                                        void handleCellCommit(tit.id, rowIdx, col.key, value);
                                      }}
                                    />
                                  </td>
                                ))}
                                <td className="border border-gray-200 p-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      tit.id != null && handleRowDelete(tit.id, rowIdx)
                                    }
                                    className="flex h-8 w-8 items-center justify-center rounded text-red-500 hover:bg-red-50"
                                    aria-label="行を削除"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">表定義を選択すると列が表示されます。</p>
                    )}

                    {cols.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          tit.id != null && handleRowAdd(tit.id, tit.tableDefinitionId)
                        }
                        className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        行を追加
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Plus className="h-4 w-4" />
        表を追加
      </button>
    </div>
  );
}
