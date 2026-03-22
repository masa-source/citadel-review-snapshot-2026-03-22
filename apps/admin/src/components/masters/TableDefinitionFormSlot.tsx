import React, { useState, useEffect } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { MasterFormActions } from "@citadel/ui";
import type { MasterCrudFormSlotProps } from "@citadel/ui";

/** 表定義の列 1 件（API は key / name の配列） */
export type TableDefinitionColumn = { key: string; name: string };

/** 表定義フォーム用の型（id / name / roleKey は metadata と API に合わせる） */
export type TableDefinitionItem = {
  id?: string | null;
  name?: string | null;
  roleKey?: string | null;
  columns?: TableDefinitionColumn[] | null;
};

const emptyColumns: TableDefinitionColumn[] = [];

/**
 * 表定義（table-definitions）用のフォームスロット。
 * テーブル名・役割キー（Scout のデフォルト）に加え、列定義（key / 表示名）の追加・削除・並び替えが可能。
 */
export function TableDefinitionFormSlot(
  props: MasterCrudFormSlotProps<TableDefinitionItem>
): React.ReactElement {
  const { mode, item, onSave, onCancel, saving } = props;

  const [name, setName] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [columns, setColumns] = useState<TableDefinitionColumn[]>(emptyColumns);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps -- フォーム初期化のための意図的な副作用
    if (mode === "edit" && item) {
      setName(item.name ?? "");
      setRoleKey(item.roleKey ?? "");
      setColumns(
        Array.isArray(item.columns) && item.columns.length > 0
          ? item.columns.map((c) => ({ key: c.key ?? "", name: c.name ?? "" }))
          : []
      );
    } else {
      setName("");
      setRoleKey("");
      setColumns([]);
    }
  }, [mode, item]);

  const handleAddColumn = () => {
    setColumns((prev) => [...prev, { key: "", name: "" }]);
  };

  const handleRemoveColumn = (index: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveColumn = (index: number, direction: "up" | "down") => {
    setColumns((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleColumnChange = (index: number, field: "key" | "name", value: string) => {
    setColumns((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = async () => {
    const payload: Partial<TableDefinitionItem> = {
      name: name.trim() || undefined,
      roleKey: roleKey.trim() || undefined,
      columns: columns
        .filter((c) => c.key.trim() || c.name.trim())
        .map((c) => ({ key: c.key.trim(), name: c.name.trim() })),
    };
    if (mode === "edit" && item?.id) payload.id = item.id;
    await onSave(payload);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">テーブル名（必須）</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            placeholder="例: 圧力測定データ"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            役割キー（Scout のデフォルト）
          </label>
          <input
            type="text"
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            placeholder="例: pressure_measurement"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">列定義</label>
          <button
            type="button"
            onClick={handleAddColumn}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            列を追加
          </button>
        </div>
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  キー
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  表示名
                </th>
                <th className="px-3 py-2 w-28 text-right text-xs font-medium text-gray-500 uppercase">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {columns.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-sm text-gray-500 text-center">
                    「列を追加」で列を追加してください。
                  </td>
                </tr>
              ) : (
                columns.map((col, index) => (
                  <tr key={index}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={col.key}
                        onChange={(e) => handleColumnChange(index, "key", e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        placeholder="英数字"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) => handleColumnChange(index, "name", e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        placeholder="表示名"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleMoveColumn(index, "up")}
                          disabled={index === 0}
                          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
                          aria-label="上へ"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveColumn(index, "down")}
                          disabled={index === columns.length - 1}
                          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
                          aria-label="下へ"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveColumn(index)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600"
                          aria-label="削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end border-t pt-4">
        <MasterFormActions mode={mode} onSave={handleSave} onCancel={onCancel} saving={saving} />
      </div>
    </div>
  );
}
