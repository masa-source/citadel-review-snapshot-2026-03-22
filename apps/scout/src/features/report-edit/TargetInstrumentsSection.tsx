import { useCallback } from "react";
import { getRepository } from "@/services/data";
import type { TargetInstrument } from "@citadel/types";
import { useLiveQuery } from "dexie-react-hooks";
import { InstrumentListView } from "./InstrumentListView";
import { useReportEditState } from "./useReportEditState";
import { useReportEditDomainStore } from "./store";
import { ConfirmDialog, useConfirmDialog } from "@citadel/ui";
import { useChildCollection } from "@/hooks/useChildCollection";

/**
 * 対象機器一覧セクション。useReportEditState / Domain Store から reportId 等を取得し、
 * 自前で LiveQuery と並び替えハンドラを管理する。フォーム等と疎結合。
 */
export function TargetInstrumentsSection(): React.ReactElement {
  const { reportId } = useReportEditState();
  const { isReadOnly, setViewMode } = useReportEditDomainStore();
  const confirmDialog = useConfirmDialog();
  const targetInstrumentsRepo = getRepository("targetInstruments");
  const targetInstrumentTablesRepo = getRepository("targetInstrumentTables");

  const { swap, remove } = useChildCollection({
    reportId: reportId ?? "",
    setRows: () => {}, // 編集モードのみなので dummy
    serviceSwap: async (rid, idx, dir) => {
      await targetInstrumentsRepo.swapSortOrder(rid, idx, dir);
    },
    serviceDelete: async (rid, instrumentId) => {
      const ok = await confirmDialog.ask({
        title: "対象機器の削除",
        description: "この対象機器を削除しますか？紐づく表データも削除されます。",
        variant: "danger",
        confirmLabel: "削除",
      });
      if (!ok) return;
      await targetInstrumentTablesRepo.deleteByTargetInstrumentId(instrumentId);
      await targetInstrumentsRepo.delete(instrumentId);
      await targetInstrumentsRepo.reorderSortOrder(rid);
    },
  });

  const targetInstruments = useLiveQuery(async () => {
    if (!reportId) return [] as TargetInstrument[];
    return targetInstrumentsRepo.getByReportId(reportId);
  }, [reportId, targetInstrumentsRepo]);

  const onMoveUp = useCallback(
    async (instrumentId: string) => {
      if (!reportId || !targetInstruments) return;
      const i = targetInstruments.findIndex((t) => t.id === instrumentId);
      if (i <= 0) return;
      await swap(i, "up");
    },
    [reportId, targetInstruments, swap]
  );

  const onMoveDown = useCallback(
    async (instrumentId: string) => {
      if (!reportId || !targetInstruments) return;
      const i = targetInstruments.findIndex((t) => t.id === instrumentId);
      if (i < 0 || i >= targetInstruments.length - 1) return;
      await swap(i, "down");
    },
    [reportId, targetInstruments, swap]
  );

  const onDelete = useCallback(
    async (instrumentId: string) => {
      await remove(instrumentId);
    },
    [remove]
  );

  return (
    <>
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel={confirmDialog.cancelLabel}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={confirmDialog.onCancel}
        onOpenChange={confirmDialog.onOpenChange}
      />
      <InstrumentListView
        targetInstruments={targetInstruments}
        onAdd={() => setViewMode({ type: "instrument", instrumentId: "new" })}
        onSelect={(id) => setViewMode({ type: "instrument", instrumentId: id })}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDelete={onDelete}
        isReadOnly={isReadOnly}
      />
    </>
  );
}
