/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { notify } from "@/services/notify";
import { generateUUID } from "@/utils/uuid";
import { getRepository } from "@/services/data";
import type { ScoutMasterConfig } from "./ScoutMasterPage";
import type { MasterMetadataKey, MasterMetadata } from "@citadel/ui";
import { GenericMasterFormSlot, type GetRefOptions } from "@citadel/ui";

/** RefSelectWidget 用: refTarget（API パス形式）を Scout のリポジトリキーに変換 */
const refTargetToRepoKey: Record<string, string> = {
  companies: "companies",
  workers: "workers",
  instruments: "instruments",
  sites: "sites",
  parts: "parts",
  "owned-instruments": "ownedInstruments",
  "schema-definitions": "schemaDefinitions",
  "table-definitions": "tableDefinitions",
};

export interface GenericScoutMasterConfigParams<T> {
  entityKey: MasterMetadataKey;
  repoKey?: string;
  metadata: MasterMetadata<T>;
  title: string;
  listTitle?: string;
  emptyMessage?: string;
  deleteConfirmMessage?: string;
}

export function useGenericScoutMasterConfig<T extends { id?: string | null }>({
  entityKey,
  repoKey,
  metadata,
  title,
  listTitle,
  emptyMessage = "データがありません。「新規作成」ボタンから追加してください。",
  deleteConfirmMessage = "この項目を削除しますか？",
}: GenericScoutMasterConfigParams<T>): ScoutMasterConfig<T> {
  // DBリポジトリの取得
  const repo = getRepository((repoKey ?? entityKey) as any);

  // LiveQueryで一覧を監視
  const items = useLiveQuery(() => repo.list() as Promise<T[]>, [entityKey]);
  const list = items ?? [];
  const isLoading = items === undefined;

  const createItem = async (payload: Partial<T>) => {
    try {
      const newId = generateUUID();
      await repo.add({ ...payload, id: newId } as any);
      notify.success("追加しました");
    } catch (err) {
      notify.error("追加に失敗しました。詳細をご確認ください。", err);
      throw err;
    }
  };

  const updateItem = async (id: string, payload: Partial<T>) => {
    try {
      await repo.update(id, payload as any);
      notify.success("保存しました");
    } catch (err) {
      notify.error("保存に失敗しました。詳細をご確認ください。", err);
      throw err;
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await repo.remove(id);
      notify.success("削除しました");
    } catch (err) {
      notify.error("削除に失敗しました。関連データがある可能性があります。", err);
      throw err;
    }
  };

  const getRefOptions: GetRefOptions = useCallback(async (refTarget) => {
    const repoKey = refTargetToRepoKey[refTarget];
    if (!repoKey) return [];
    try {
      const list = await getRepository(repoKey as any).list();
      return Array.isArray(list) ? (list as Array<{ id: string; [k: string]: unknown }>) : [];
    } catch {
      return [];
    }
  }, []);

  return {
    list,
    isLoading,
    create: createItem,
    update: updateItem,
    delete: deleteItem,
    columns: metadata.columns as any,
    getRowId: (item) => item.id ?? "",
    title,
    backHref: "/masters",
    listTitle: listTitle ?? `${title}一覧`,
    emptyMessage,
    deleteConfirmMessage,
    formSlot: (props) => (
      <GenericMasterFormSlot
        {...props}
        metadata={metadata as any}
        emptyData={{}}
        formContext={{ getRefOptions }}
      />
    ),
  };
}
