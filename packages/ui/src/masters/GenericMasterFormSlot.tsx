import React, { useState, useEffect } from "react";
import { GenericDynamicForm } from "./GenericDynamicForm";
import { MasterFormActions } from "./MasterFormActions";
import type { MasterMetadata } from "./metadata";
import type { MasterCrudFormSlotProps } from "./MasterCrud";

export interface GenericMasterFormSlotProps<T> extends MasterCrudFormSlotProps<T> {
  metadata: MasterMetadata<T>;
  emptyData: Partial<T>;
  /** RefSelectWidget が参照する getRefOptions を渡す formContext */
  formContext?: Record<string, unknown>;
}

export function GenericMasterFormSlot<T extends { id?: string | null }>({
  mode,
  item,
  onSave,
  onCancel,
  metadata,
  emptyData,
  formContext,
}: GenericMasterFormSlotProps<T>): React.ReactElement {
  // 初期値を設定 (作成時はemptyData, 編集時は既存のitem)
  const initialData = mode === "edit" && item ? item : emptyData;
  // #region agent log
  const itemWithNulls =
    item && typeof item === "object"
      ? Object.keys(item as object).filter((k) => (item as Record<string, unknown>)[k] === null)
      : [];
  if (itemWithNulls.length > 0) {
    fetch("http://127.0.0.1:7242/ingest/94b6906e-07df-4dad-90e1-9efb8f6f10ac", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3b969d" },
      body: JSON.stringify({
        sessionId: "3b969d",
        location: "GenericMasterFormSlot.tsx:initialData",
        message: "item (edit) has null values",
        data: { keys: itemWithNulls, mode },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  const [formData, setFormData] = useState<Partial<T>>(initialData as Partial<T>);

  // itemが外から変わった場合に同期する（編集キャンセル時等）
  useEffect(() => {
    setFormData(mode === "edit" && item ? item : (emptyData as Partial<T>));
  }, [mode, item, emptyData]);

  const handleSave = () => {
    if (mode === "edit" && item?.id) {
      // 編集時はidを維持する
      onSave({ ...formData, id: item.id } as T);
    } else {
      onSave(formData as T);
    }
  };

  return (
    <div className="space-y-4">
      <GenericDynamicForm
        schema={metadata.schema}
        uiSchema={metadata.uiSchema}
        formData={formData as Record<string, unknown>}
        onChange={(data) => setFormData(data as Partial<T>)}
        formContext={formContext}
      />
      <div className="flex justify-end border-t pt-4">
        <MasterFormActions mode={mode} onSave={handleSave} onCancel={onCancel} saving={false} />
      </div>
    </div>
  );
}
