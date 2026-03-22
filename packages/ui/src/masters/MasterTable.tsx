import React from "react";

export interface MasterTableColumn<T> {
  key: string;
  label: string;
  render: (item: T) => React.ReactNode;
}

export interface MasterTableProps<T> {
  columns: MasterTableColumn<T>[];
  data: T[];
  getRowId: (item: T) => string;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  editLabel?: string;
  deleteLabel?: string;
  disabled?: boolean;
  deletingId?: string | null;
  /** 削除中に表示する要素（例: スピナー） */
  deletingNode?: React.ReactNode;
  actionColumnClassName?: string;
  /** アクション列に「編集」「削除」の前に挿入する任意のノード */
  customActions?: (item: T) => React.ReactNode;
}

export function MasterTable<T>({
  columns,
  data,
  getRowId,
  onEdit,
  onDelete,
  editLabel = "編集",
  deleteLabel = "削除",
  disabled = false,
  deletingId = null,
  deletingNode,
  actionColumnClassName,
  customActions,
}: MasterTableProps<T>): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
              >
                {col.label}
              </th>
            ))}
            <th
              className={
                actionColumnClassName ??
                "px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"
              }
            >
              アクション
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((item) => {
            const id = getRowId(item);
            const isDeleting = deletingId === id;
            return (
              <tr key={id} className="hover:bg-gray-50 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-sm">
                    {col.render(item)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {customActions?.(item)}
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      disabled={disabled}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                      {editLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      disabled={disabled || isDeleting}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors bg-red-50 text-red-700 hover:bg-red-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                      {isDeleting && deletingNode ? deletingNode : deleteLabel}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
