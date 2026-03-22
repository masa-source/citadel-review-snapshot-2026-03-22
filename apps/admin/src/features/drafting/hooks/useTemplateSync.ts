import { useState, useCallback } from "react";
import useSWR from "swr";
import { ErrorCodes, type ErrorCode } from "@citadel/types";
import { apiClient, fetchTemplateGrid } from "@/utils/api";
import type { GridResponse, GridChange, EditMode } from "@/features/drafting/types";

export interface UseTemplateSyncArgs {
  templateId: string | undefined;
}

export type PathChangeModalState =
  | { open: true; currentPath: string; newPath: string }
  | { open: false };

export type BackupFailedModalState =
  | {
      open: true;
      message: string;
      reason: string;
      pendingNewFilePath?: string;
    }
  | { open: false };

export function useTemplateSync({ templateId }: UseTemplateSyncArgs) {
  const [gridCacheBuster, setGridCacheBuster] = useState(() => Date.now());
  const [editMode, setEditMode] = useState<EditMode>("internal");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pathChangeModal, setPathChangeModal] = useState<PathChangeModalState>({ open: false });
  const [backupFailedModal, setBackupFailedModal] = useState<BackupFailedModalState>({
    open: false,
  });
  const [overwriteConfirmModal, setOverwriteConfirmModal] = useState(false);
  const [fileInUseModal, setFileInUseModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [useExcelInstance, setUseExcelInstance] = useState(true);

  const {
    data: gridData,
    error: gridError,
    isLoading: gridLoading,
    mutate: mutateGrid,
  } = useSWR<GridResponse>(
    templateId ? ["template-grid", templateId, gridCacheBuster] : null,
    ([, id]) => fetchTemplateGrid(id as string),
    { revalidateOnFocus: false }
  );

  const handleSave = useCallback(
    async (forceOverwrite?: boolean, pendingChangesArg?: GridChange[]): Promise<boolean> => {
      if (!templateId) return false;
      if (editMode === "external") {
        await handleRevalidate();
        return true;
      }
      const changes = pendingChangesArg ?? [];
      if (!changes.length) return false;
      setSaving(true);
      setSaveError(null);
      setOverwriteConfirmModal(false);
      setFileInUseModal(false);
      try {
        const res = await apiClient.POST("/api/templates/{template_id}/grid", {
          params: { path: { template_id: templateId } },
          body: {
            changes: changes.map((c) => ({
              sheetName: c.sheetName,
              row: c.row,
              col: c.col,
              value: c.value,
            })),
            ...(forceOverwrite ? { forceOverwrite: true } : {}),
            useExcelInstance,
          },
        });
        if (res.error) {
          const errBody = res.error as {
            detail?: string | { code?: ErrorCode; message?: string };
          };
          const detail = errBody?.detail;
          if (
            typeof detail === "object" &&
            detail &&
            (detail as { code?: ErrorCode }).code === ErrorCodes.FILE_MODIFIED_EXTERNALLY
          ) {
            setOverwriteConfirmModal(true);
            setSaveError(null);
          } else if (
            typeof detail === "object" &&
            detail &&
            (detail as { code?: ErrorCode }).code === ErrorCodes.FILE_IN_USE
          ) {
            setFileInUseModal(true);
            setSaveError(null);
          } else {
            setSaveError(
              typeof detail === "string"
                ? detail
                : ((detail as { message?: string })?.message ?? "保存に失敗しました。")
            );
          }
          return false;
        }
        await mutateGrid();
        return true;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "保存に失敗しました。";
        setSaveError(message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    // handleRevalidate を追加すると循環参照になるため省略
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templateId, editMode, useExcelInstance, mutateGrid]
  );

  const handleRevalidate = useCallback(
    async (newFilePath?: string, forceContinue?: boolean) => {
      if (!templateId) return;
      setSaving(true);
      setSaveError(null);
      setBackupFailedModal({ open: false });
      try {
        const revalBody: { newFilePath?: string; forceContinue?: boolean } = {};
        if (newFilePath?.trim()) revalBody.newFilePath = newFilePath.trim();
        if (forceContinue) revalBody.forceContinue = true;
        const res = await apiClient.POST("/api/templates/{template_id}/revalidate", {
          params: { path: { template_id: templateId } },
          body: revalBody,
        });
        const resData = res.data as
          | { ok?: boolean; filePath?: string; lastModified?: string }
          | undefined;
        if (resData?.ok) {
          setPathChangeModal({ open: false });
          setBackupFailedModal({ open: false });
          setGridCacheBuster(Date.now());
          await mutateGrid();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "再検証に失敗しました。";
        setSaveError(message);
      } finally {
        setSaving(false);
      }
    },
    [templateId, mutateGrid]
  );

  const handleEditModeChange = useCallback(
    (next: EditMode) => {
      const wasExternal = editMode === "external";
      setEditMode(next);
      if (wasExternal && next === "internal") {
        setGridCacheBuster(Date.now());
        mutateGrid();
        setToastMessage("外部での変更を読み込みます");
        window.setTimeout(() => setToastMessage(null), 3000);
      }
    },
    [editMode, mutateGrid]
  );

  return {
    gridData,
    gridError,
    gridLoading,
    mutateGrid,
    editMode,
    setEditMode,
    handleEditModeChange,
    handleSave,
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
    gridCacheBuster,
    setGridCacheBuster,
    toastMessage,
  };
}
