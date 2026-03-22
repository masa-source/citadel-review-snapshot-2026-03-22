import { useState, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, MessageSquare } from "lucide-react";
import { cn } from "@citadel/ui";
import { type LayoutMode } from "@/features/drafting/types";
import { useDraftingTree } from "@/features/drafting/hooks/useDraftingTree";
import { useTemplateSync } from "@/features/drafting/hooks/useTemplateSync";
import { usePlaceholderMatching } from "@/features/drafting/hooks/usePlaceholderMatching";
import { useDraftingStore } from "@/features/drafting/store";
import { DraftingHeader } from "@/features/drafting/components/DraftingHeader";
import { DraftingSidebar } from "@/features/drafting/components/DraftingSidebar";
import { DraftingSheetTree } from "@/features/drafting/components/DraftingSheetTree";
import { PathChangeModal } from "@/features/drafting/components/PathChangeModal";
import { BackupFailedModal } from "@/features/drafting/components/BackupFailedModal";
import { OverwriteConfirmModal } from "@/features/drafting/components/OverwriteConfirmModal";
import { FileInUseConfirmModal } from "@/features/drafting/components/FileInUseConfirmModal";
import { MatchResultModal } from "@/features/drafting/components/MatchResultModal";

export default function DraftingPage() {
  const params = useParams();
  const templateId = params?.id as string;

  /** 表示レイアウト: 分割 / グリッド最大化 / ツリー最大化 */
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("split");

  const {
    gridData,
    gridError,
    gridLoading,
    editMode,
    handleEditModeChange,
    handleSave: syncHandleSave,
    handleRevalidate,
    pathChangeModal,
    setPathChangeModal,
    backupFailedModal,
    setBackupFailedModal,
    overwriteConfirmModal,
    setOverwriteConfirmModal,
    fileInUseModal,
    setFileInUseModal,
    saving,
    saveError,
    useExcelInstance,
    setUseExcelInstance,
    toastMessage,
  } = useTemplateSync({ templateId });

  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [treeFilterKeyword, setTreeFilterKeyword] = useState("");

  const recentlyUpdatedCells = useDraftingStore((s) => s.recentlyUpdatedCells);
  const setRecentlyUpdatedCells = useDraftingStore((s) => s.setRecentlyUpdatedCells);
  const clearPendingChanges = useDraftingStore((s) => s.clearPendingChanges);

  const sheets = gridData?.sheets ?? [];
  const currentSheet = sheets[currentSheetIndex];

  const {
    pendingChanges,
    activeCell,
    setActiveCell,
    openIds,
    setOpenIds,
    treeNodes,
    handleCellChange,
  } = useDraftingTree({ currentSheet });

  const matching = usePlaceholderMatching({
    editMode,
    currentSheet,
  });
  const {
    reports,
    selectedReportId,
    setSelectedReportId,
    contextData,
    contextLoading,
    matchModalOpen,
    setMatchModalOpen,
    matchResults,
    matchChecked,
    setMatchChecked,
    handleInsertPlaceholder,
    handleAutoMatchScan,
    handleApplyMatches,
    insertFeedback,
  } = matching;

  // 一括置換後のハイライトを 3 秒後に解除
  useEffect(() => {
    if (recentlyUpdatedCells.size === 0) return;
    const t = window.setTimeout(() => setRecentlyUpdatedCells(new Set()), 3000);
    return () => clearTimeout(t);
  }, [recentlyUpdatedCells, setRecentlyUpdatedCells]);

  const handleSave = useCallback(
    async (forceOverwrite?: boolean) => {
      const ok = await syncHandleSave(forceOverwrite, pendingChanges);
      if (ok) clearPendingChanges();
    },
    [syncHandleSave, pendingChanges, clearPendingChanges]
  );

  const handlePathChangeSubmit = () => {
    if (pathChangeModal.open && pathChangeModal.newPath.trim()) {
      handleRevalidate(pathChangeModal.newPath.trim());
    }
  };

  if (!templateId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">テンプレートIDがありません。</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <DraftingHeader
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        editMode={editMode}
        onEditModeChange={handleEditModeChange}
        useExcelInstance={useExcelInstance}
        onUseExcelInstanceChange={setUseExcelInstance}
        saving={saving}
        pendingChangesCount={pendingChanges.length}
        onSave={() => handleSave()}
        saveError={saveError}
      />

      <div className="flex-1 p-4 overflow-hidden flex flex-col">
        <div className="mb-3 space-y-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 flex items-start gap-3">
            <MessageSquare className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">
              ここは簡易設計台です。表示されているのは「値」だけですが、実際のファイルには罫線や色が残っています。安心して配置を決めてください。
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              元のExcelで結合セルになっている範囲は、値が入っている左上のセルだけ編集できます。それ以外のセルは結合の一部のため編集できません（グレー背景で表示しています）。
            </p>
          </div>
        </div>

        {saveError && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{saveError}</p>
          </div>
        )}

        {/* トースト: 外部→内部切替時 */}
        {toastMessage && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm shadow-lg">
            {toastMessage}
          </div>
        )}

        <div
          className={cn(
            "flex-1 grid gap-4 min-h-0",
            layoutMode === "split" && "grid-cols-1 lg:grid-cols-2",
            layoutMode === "grid" && "grid-cols-1",
            layoutMode === "tree" && "grid-cols-1"
          )}
        >
          <div
            className={cn(
              "flex flex-col min-h-0 border rounded-xl shadow-sm overflow-hidden",
              layoutMode === "tree" && "hidden",
              editMode === "internal" && "border-gray-200 bg-white",
              editMode === "external" && "border-slate-200 bg-slate-50/80"
            )}
          >
            <DraftingSheetTree
              treeNodes={treeNodes}
              openIds={openIds}
              onOpenChange={setOpenIds}
              activeCell={activeCell}
              onActiveCellChange={(row, col) => setActiveCell([row, col])}
              onCellChange={handleCellChange}
              contextData={contextData}
              gridLoading={gridLoading}
              gridError={gridError}
              currentSheet={currentSheet}
              sheets={sheets}
              currentSheetIndex={currentSheetIndex}
              onCurrentSheetIndexChange={setCurrentSheetIndex}
              sheetNameMismatch={gridData?.sheetNameMismatch}
              storedSheetNames={gridData?.storedSheetNames}
              currentSheetNames={gridData?.currentSheetNames}
              editMode={editMode}
              recentlyUpdatedCells={recentlyUpdatedCells}
            />
          </div>

          <div className={cn("flex flex-col min-h-0", layoutMode === "grid" && "hidden")}>
            <DraftingSidebar
              reports={reports}
              selectedReportId={selectedReportId}
              onSelectedReportIdChange={setSelectedReportId}
              contextData={contextData}
              contextLoading={contextLoading}
              treeFilterKeyword={treeFilterKeyword}
              onTreeFilterKeywordChange={setTreeFilterKeyword}
              onInsertPlaceholder={handleInsertPlaceholder}
              onAutoMatchScan={handleAutoMatchScan}
              insertFeedback={insertFeedback}
              editMode={editMode}
              currentSheet={currentSheet}
              gridReady={!!currentSheet}
            />
          </div>
        </div>
      </div>

      <PathChangeModal
        state={pathChangeModal}
        onClose={() => setPathChangeModal({ open: false })}
        onNewPathChange={(newPath) =>
          setPathChangeModal((prev) => (prev.open ? { ...prev, newPath } : prev))
        }
        onSubmit={handlePathChangeSubmit}
        saving={saving}
      />

      <BackupFailedModal
        state={backupFailedModal}
        onClose={() => setBackupFailedModal({ open: false })}
        onContinue={(pending) => {
          setBackupFailedModal({ open: false });
          handleRevalidate(pending, true);
        }}
        saving={saving}
      />

      <OverwriteConfirmModal
        open={overwriteConfirmModal}
        onClose={() => setOverwriteConfirmModal(false)}
        onConfirmOverwrite={() => handleSave(true)}
        saving={saving}
      />

      <FileInUseConfirmModal
        open={fileInUseModal}
        onClose={() => setFileInUseModal(false)}
        onRetry={() => {
          setFileInUseModal(false);
          handleSave();
        }}
        saving={saving}
      />

      <MatchResultModal
        open={matchModalOpen}
        onClose={() => setMatchModalOpen(false)}
        matchResults={matchResults}
        matchChecked={matchChecked}
        onMatchCheckedChange={(index, checked) => {
          setMatchChecked((prev) => {
            const next = [...prev];
            next[index] = checked;
            return next;
          });
        }}
        onApply={handleApplyMatches}
      />
    </div>
  );
}
