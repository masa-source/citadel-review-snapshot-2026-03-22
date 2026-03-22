import { useCallback, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2 } from "lucide-react";

import { getRepository } from "@/services/data";
import type { OwnedInstrument, ReportOwnedInstrument } from "@citadel/types";
import { generateUUID } from "@/utils/uuid";

type Props = {
  reportId: string;
};

function getInstrumentLabel(owned: OwnedInstrument): string {
  const name = owned.equipmentName ?? "";
  const num = owned.managementNumber ?? owned.equipmentNumber ?? "";
  if (name && num) return `${name} (${num})`;
  return name || num || `ID: ${owned.id ?? "—"}`;
}

export function ReportOwnedInstrumentsForm({ reportId }: Props) {
  const [selectedId, setSelectedId] = useState<string | "">("");

  const ownedInstrumentsRepo = getRepository("ownedInstruments");
  const reportOwnedRepo = getRepository("reportOwnedInstruments");
  const ownedInstruments = useLiveQuery(() => ownedInstrumentsRepo.list(), [ownedInstrumentsRepo]);

  const reportOwned = useLiveQuery(
    () => reportOwnedRepo.getByReportId(reportId),
    [reportId, reportOwnedRepo]
  );

  const addedIds = useMemo(
    () =>
      new Set(
        reportOwned?.map((r) => r.ownedInstrumentId).filter((id): id is string => id != null) ?? []
      ),
    [reportOwned]
  );

  const handleAdd = useCallback(async () => {
    if (selectedId === "" || selectedId == null) return;
    if (addedIds.has(selectedId)) return;
    const nextOrder =
      (reportOwned?.length ?? 0) === 0
        ? 0
        : Math.max(...(reportOwned?.map((r) => r.sortOrder ?? 0) ?? [0]), -1) + 1;
    await reportOwnedRepo.add({
      id: generateUUID(),
      reportId,
      ownedInstrumentId: selectedId,
      sortOrder: nextOrder,
    } as ReportOwnedInstrument);
    setSelectedId("");
  }, [reportId, selectedId, addedIds, reportOwned, reportOwnedRepo]);

  const handleDelete = useCallback(
    async (id: string) => {
      await reportOwnedRepo.delete(id);
    },
    [reportOwnedRepo]
  );

  const getOwnedById = useCallback(
    (ownedInstrumentId: string | null | undefined): OwnedInstrument | undefined =>
      ownedInstruments?.find((o) => o.id === ownedInstrumentId),
    [ownedInstruments]
  );

  if (ownedInstruments === undefined || reportOwned === undefined) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        使用計測器を読み込み中...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-gray-800">
        使用計測器 (Report Owned Instruments)
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">計測器を選択</span>
          <select
            value={selectedId === "" ? "" : selectedId}
            onChange={(e) => setSelectedId(e.target.value === "" ? "" : e.target.value)}
            className="min-h-[44px] min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">— 選択 —</option>
            {ownedInstruments.map((o) => (
              <option key={o.id} value={o.id ?? ""} disabled={addedIds.has(o.id!)}>
                {getInstrumentLabel(o)}
                {addedIds.has(o.id!) ? " (追加済)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={handleAdd}
          disabled={selectedId === ""}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          追加
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-200 px-2 py-2 text-left font-medium text-gray-700">
                機器名 / 管理番号
              </th>
              <th className="w-10 border border-gray-200 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {reportOwned.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="border border-gray-200 px-4 py-6 text-center text-sm text-gray-500"
                >
                  使用計測器がありません。上から選択して追加してください。
                </td>
              </tr>
            ) : (
              reportOwned.map((row) => {
                const owned = getOwnedById(row.ownedInstrumentId);
                return (
                  <tr key={row.id} className="bg-white">
                    <td className="border border-gray-200 px-2 py-2">
                      {owned ? getInstrumentLabel(owned) : `ID: ${row.ownedInstrumentId ?? "—"}`}
                    </td>
                    <td className="border border-gray-200 p-2">
                      <button
                        type="button"
                        onClick={() => row.id != null && handleDelete(row.id)}
                        className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded text-red-600 hover:bg-red-50"
                        aria-label="削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
