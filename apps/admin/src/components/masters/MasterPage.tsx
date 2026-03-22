import { useMemo } from "react";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import {
  MasterCrud,
  type MasterCrudFormSlotProps,
  type MasterTableColumn,
  ConfirmDialog,
  useConfirmDialog,
} from "@citadel/ui";

export interface MasterPageConfig<T> {
  listKey: string;
  getList: () => Promise<T[]>;
  create: (payload: Partial<T>) => Promise<void>;
  update: (id: string, payload: Partial<T>) => Promise<void>;
  delete: (id: string) => Promise<void>;
  columns: MasterTableColumn<T>[];
  getRowId: (item: T) => string;
  title: string;
  backHref: string;
  listTitle?: string;
  emptyMessage?: string;
  formSlot: (props: MasterCrudFormSlotProps<T>) => React.ReactNode;
  /** デフォルトの削除確認メッセージ（指定がない場合は標準メッセージ） */
  deleteConfirmMessage?: string | ((item: T) => string);
  /**
   * カスタムの削除前処理（非推奨: useConfirmDialog に移行するため deleteConfirmMessage を推奨）
   */
  onBeforeDelete?: (item: T) => Promise<boolean>;
  /** 編集ボタン押下時のカスタム挙動（指定するとインラインフォーム展開の代わりに実行される） */
  onEditOverride?: (item: T) => void;
  /** テーブルのアクション列に追加するカスタムボタン群 */
  customActions?: (item: T) => React.ReactNode;
}

export function MasterPage<T>({ config }: { config: MasterPageConfig<T> }): React.ReactElement {
  const { data, error, isLoading, mutate } = useSWR<T[]>(config.listKey, config.getList);
  const confirmDialog = useConfirmDialog();

  const handleBeforeDelete = async (item: T): Promise<boolean> => {
    if (config.onBeforeDelete) {
      return config.onBeforeDelete(item);
    }
    const message =
      typeof config.deleteConfirmMessage === "function"
        ? config.deleteConfirmMessage(item)
        : (config.deleteConfirmMessage ?? "この項目を削除しますか？");

    return confirmDialog.ask({
      title: "削除の確認",
      description: message,
      confirmLabel: "削除",
      variant: "danger",
    });
  };

  const adapter = useMemo(
    () => ({
      list: data ?? [],
      isLoading,
      error: error ? "データの取得に失敗しました。" : null,
      async create(payload: Partial<T>) {
        await config.create(payload);
        mutate();
      },
      async update(id: string, payload: Partial<T>) {
        await config.update(id, payload);
        mutate();
      },
      async delete(id: string) {
        await config.delete(id);
        mutate();
      },
      refetch: mutate,
    }),
    [data, isLoading, error, mutate, config]
  );

  return (
    <>
      <MasterCrud<T>
        adapter={adapter}
        columns={config.columns}
        getRowId={config.getRowId}
        title={config.title}
        backHref={config.backHref}
        listTitle={config.listTitle}
        emptyMessage={config.emptyMessage}
        loadingNode={<Loader2 className="w-8 h-8 text-gray-400 animate-spin" />}
        deletingNode={<Loader2 className="w-4 h-4 animate-spin" />}
        onBeforeDelete={handleBeforeDelete}
        formSlot={config.formSlot}
        onEditOverride={config.onEditOverride}
        customActions={config.customActions}
      />
      <ConfirmDialog {...confirmDialog} />
    </>
  );
}
