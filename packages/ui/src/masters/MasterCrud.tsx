import React, { useState } from "react";
import type { MasterCrudAdapter } from "./MasterCrudAdapter";
import type { MasterTableColumn } from "./MasterTable";
import { MasterTable } from "./MasterTable";

export interface MasterCrudFormSlotProps<T> {
  mode: "create" | "edit";
  item: T | null;
  onSave: (payload: Partial<T>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

export interface MasterCrudProps<T> {
  adapter: MasterCrudAdapter<T>;
  columns: MasterTableColumn<T>[];
  getRowId: (item: T) => string;
  title: string;
  backHref: string;
  backLabel?: string;
  formSlot: (props: MasterCrudFormSlotProps<T>) => React.ReactNode;
  emptyMessage?: string;
  onBeforeDelete?: (item: T) => Promise<boolean>;
  /** 新規ボタンラベル */
  createLabel?: string;
  /** 一覧エリアの見出し（未指定時は「一覧」など省略可） */
  listTitle?: string;
  /** ローディング表示用のノード（例: スピナー） */
  loadingNode?: React.ReactNode;
  /** 削除中表示用のノード（例: スピナー） */
  deletingNode?: React.ReactNode;
  /** 編集ボタン押下時のカスタム挙動（指定するとインラインフォーム展開の代わりに実行される） */
  onEditOverride?: (item: T) => void;
  /** テーブルのアクション列に追加するカスタムボタン群 */
  customActions?: (item: T) => React.ReactNode;
}

export function MasterCrud<T>({
  adapter,
  columns,
  getRowId,
  title,
  backHref,
  backLabel = "戻る",
  formSlot,
  emptyMessage = "データがありません。",
  onBeforeDelete,
  createLabel = "新規作成",
  listTitle,
  loadingNode,
  deletingNode,
  onEditOverride,
  customActions,
}: MasterCrudProps<T>): React.ReactElement {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingItem, setEditingItem] = useState<T | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isFormOpen = showCreateForm || editingItem !== null;
  const list = adapter.list ?? [];
  const isLoading = adapter.isLoading === true;
  const error = adapter.error ?? null;

  const handleOpenCreate = () => {
    setShowCreateForm(true);
    setEditingItem(null);
    setFormError(null);
  };

  const handleEdit = (item: T) => {
    if (onEditOverride) {
      onEditOverride(item);
      return;
    }
    setEditingItem(item);
    setShowCreateForm(false);
    setFormError(null);
  };

  const handleCancelForm = () => {
    setShowCreateForm(false);
    setEditingItem(null);
    setFormError(null);
  };

  const handleSave = async (payload: Partial<T>) => {
    setSaving(true);
    setFormError(null);
    try {
      if (editingItem !== null) {
        const id = getRowId(editingItem);
        await adapter.update(id, payload);
      } else {
        await adapter.create(payload);
      }
      adapter.refetch?.();
      setShowCreateForm(false);
      setEditingItem(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存に失敗しました。";
      setFormError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: T) => {
    const id = getRowId(item);
    const ok = onBeforeDelete ? await onBeforeDelete(item) : true;
    if (!ok) return;
    setDeletingId(id);
    try {
      await adapter.delete(id);
      adapter.refetch?.();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center gap-2 h-14 sm:h-16 min-h-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <a
                href={backHref}
                className="flex-shrink-0 p-1 text-gray-600 hover:text-gray-900 -m-1"
              >
                <span className="sr-only">{backLabel}</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </a>
              <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">{title}</h1>
            </div>
            <button
              type="button"
              onClick={handleOpenCreate}
              disabled={isFormOpen}
              className={
                isFormOpen
                  ? "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium text-white transition-colors flex-shrink-0 text-sm sm:text-base bg-gray-400 cursor-not-allowed"
                  : "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium text-white transition-colors flex-shrink-0 text-sm sm:text-base bg-indigo-600 hover:bg-indigo-700"
              }
            >
              <svg
                className="w-4 h-4 hidden sm:block"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              {createLabel}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {formError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <svg
              className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-red-700">{formError}</p>
          </div>
        )}

        {(showCreateForm || editingItem !== null) && (
          <div className="bg-white rounded-xl shadow-sm border border-indigo-200 p-6 mb-6">
            {formSlot({
              mode: editingItem !== null ? "edit" : "create",
              item: editingItem,
              onSave: handleSave,
              onCancel: handleCancelForm,
              saving,
            })}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {listTitle != null && (
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{listTitle}</h2>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              {loadingNode ?? (
                <svg className="w-8 h-8 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-600">{error}</div>
          ) : list.length > 0 ? (
            <MasterTable<T>
              columns={columns}
              data={list}
              getRowId={getRowId}
              onEdit={handleEdit}
              onDelete={handleDelete}
              disabled={isFormOpen}
              deletingId={deletingId}
              deletingNode={deletingNode}
              customActions={customActions}
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">{emptyMessage}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
