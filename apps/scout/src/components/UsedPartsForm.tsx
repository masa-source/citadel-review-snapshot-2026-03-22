import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2 } from "lucide-react";
import { SortableButtons } from "@/components/SortableButtons";

import { getRepository } from "@/services/data";
import type { UsedPart } from "@citadel/types";
import { generateUUID } from "@/utils/uuid";

type Props = {
  reportId: string;
};

export function UsedPartsForm({ reportId }: Props) {
  const usedPartsRepo = getRepository("usedParts");
  const usedParts = useLiveQuery(
    () => usedPartsRepo.getByReportId(reportId),
    [reportId, usedPartsRepo]
  );

  const partRepo = getRepository("parts");
  const parts = useLiveQuery(() => partRepo.list(), [partRepo]);

  const handleAdd = useCallback(async () => {
    const list = await usedPartsRepo.getByReportId(reportId);
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((r) => r.sortOrder ?? 0));
    await usedPartsRepo.add({
      id: generateUUID(),
      reportId,
      partId: undefined,
      quantity: null,
      notes: "",
      sortOrder: maxOrder + 1,
    } as UsedPart);
  }, [reportId, usedPartsRepo]);

  const handleDelete = useCallback(
    async (id: string) => {
      await usedPartsRepo.delete(id);
      await usedPartsRepo.reorderSortOrder(reportId);
    },
    [reportId, usedPartsRepo]
  );

  const handlePartSelectChange = useCallback(
    async (id: string, value: string) => {
      const partId = value.trim() ? value : undefined;
      await usedPartsRepo.update(id, { partId });
    },
    [usedPartsRepo]
  );

  const handleQuantityChange = useCallback(
    async (id: string, value: string) => {
      const num = value.trim() ? Number(value) : undefined;
      await usedPartsRepo.update(id, { quantity: num });
    },
    [usedPartsRepo]
  );

  const handleNotesChange = useCallback(
    async (id: string, value: string) => {
      await usedPartsRepo.update(id, { notes: value || undefined });
    },
    [usedPartsRepo]
  );

  const handleMoveUp = useCallback(
    async (id: string) => {
      const list = await usedPartsRepo.getByReportId(reportId);
      const i = list.findIndex((r) => r.id === id);
      if (i <= 0) return;
      await usedPartsRepo.swapSortOrder(reportId, i, "up");
    },
    [reportId, usedPartsRepo]
  );

  const handleMoveDown = useCallback(
    async (id: string) => {
      const list = await usedPartsRepo.getByReportId(reportId);
      const i = list.findIndex((r) => r.id === id);
      if (i < 0 || i >= list.length - 1) return;
      await usedPartsRepo.swapSortOrder(reportId, i, "down");
    },
    [reportId, usedPartsRepo]
  );

  if (usedParts === undefined || parts === undefined) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        使用部品を読み込み中...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-gray-800">使用部品</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-200 px-2 py-2 text-left font-medium text-gray-700">
                部品
              </th>
              <th className="border border-gray-200 px-2 py-2 text-left font-medium text-gray-700">
                数量
              </th>
              <th className="border border-gray-200 px-2 py-2 text-left font-medium text-gray-700">
                備考
              </th>
              <th className="w-[88px] border border-gray-200 px-2 py-2 text-center">並び</th>
              <th className="w-10 border border-gray-200 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {usedParts.map((row) => (
              <tr key={row.id} className="bg-white">
                <td className="border border-gray-200 p-0">
                  <select
                    className="min-h-[40px] w-full min-w-[160px] border-0 px-2 py-1.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={row.partId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (row.id != null) handlePartSelectChange(row.id, v);
                    }}
                  >
                    <option value="">— 選択 —</option>
                    {parts.map((p) => (
                      <option key={p.id} value={p.id ?? ""}>
                        {p.name ?? "—"}
                        {p.partNumber ? ` (${p.partNumber})` : ""}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border border-gray-200 p-0">
                  <input
                    type="number"
                    inputMode="numeric"
                    className="min-h-[40px] w-full min-w-[60px] border-0 px-2 py-1.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={row.quantity ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const num = v.trim() ? Number(v) : undefined;
                      usedPartsRepo.update(row.id!, { quantity: num });
                    }}
                    onBlur={(e) => row.id != null && handleQuantityChange(row.id, e.target.value)}
                    placeholder="数量"
                  />
                </td>
                <td className="border border-gray-200 p-0">
                  <input
                    type="text"
                    className="min-h-[40px] w-full min-w-[100px] border-0 px-2 py-1.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={row.notes ?? ""}
                    onChange={(e) =>
                      usedPartsRepo.update(row.id!, {
                        notes: e.target.value || undefined,
                      })
                    }
                    onBlur={(e) => row.id != null && handleNotesChange(row.id, e.target.value)}
                    placeholder="備考・交換など"
                  />
                </td>
                <td className="border border-gray-200 p-1">
                  <SortableButtons
                    onMoveUp={() => row.id != null && handleMoveUp(row.id)}
                    onMoveDown={() => row.id != null && handleMoveDown(row.id)}
                    isFirst={usedParts.findIndex((r) => r.id === row.id) <= 0}
                    isLast={usedParts.findIndex((r) => r.id === row.id) >= usedParts.length - 1}
                    className="items-center justify-center gap-0.5"
                  />
                </td>
                <td className="border border-gray-200 p-2">
                  <button
                    type="button"
                    onClick={() => row.id != null && handleDelete(row.id)}
                    className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded text-red-600 hover:bg-red-50"
                    aria-label="行を削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Plus className="h-4 w-4" />
        行を追加
      </button>
    </div>
  );
}
