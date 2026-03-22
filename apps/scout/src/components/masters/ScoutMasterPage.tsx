import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  MasterCrud,
  ConfirmDialog,
  useConfirmDialog,
  type MasterTableColumn,
  type MasterCrudFormSlotProps,
} from "@citadel/ui";

export interface ScoutMasterConfig<T> {
  list: T[] | undefined;
  isLoading: boolean;
  create: (payload: Partial<T>) => Promise<void>;
  update: (id: string, payload: Partial<T>) => Promise<void>;
  delete: (id: string) => Promise<void>;
  columns: MasterTableColumn<T>[];
  getRowId: (item: T) => string;
  title: string;
  backHref: string;
  listTitle?: string;
  emptyMessage?: string;
  deleteConfirmMessage: string;
  formSlot: (props: MasterCrudFormSlotProps<T>) => React.ReactNode;
}

export function ScoutMasterPage<T>({
  config,
}: {
  config: ScoutMasterConfig<T>;
}): React.ReactElement {
  const confirmDialog = useConfirmDialog();

  const adapter = useMemo(
    () => ({
      list: config.list ?? [],
      isLoading: config.isLoading,
      error: null as string | null,
      async create(payload: Partial<T>) {
        await config.create(payload);
      },
      async update(id: string, payload: Partial<T>) {
        await config.update(id, payload);
      },
      async delete(id: string) {
        const ok = await confirmDialog.ask({
          title: "削除の確認",
          description: config.deleteConfirmMessage,
          confirmLabel: "削除",
          variant: "danger",
        });
        if (!ok) return;
        await config.delete(id);
      },
      refetch: () => {
        // Dexie の liveQuery を利用しているため、明示的な refetch は不要
      },
    }),
    [config, confirmDialog]
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
        createLabel="新規追加"
        loadingNode={<Loader2 className="w-8 h-8 text-gray-400 animate-spin" />}
        deletingNode={<Loader2 className="w-4 h-4 animate-spin" />}
        formSlot={config.formSlot}
      />
      <ConfirmDialog {...confirmDialog} />
    </>
  );
}
