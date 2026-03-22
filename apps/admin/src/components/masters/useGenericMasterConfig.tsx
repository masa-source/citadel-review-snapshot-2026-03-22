/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback } from "react";
import {
  GenericMasterFormSlot,
  type GetRefOptions,
  type MasterMetadata,
  type MasterMetadataKey,
} from "@citadel/ui";
import { apiClient, unwrap } from "@/utils/api";
import { notify } from "@/services/notify";
import type { MasterPageConfig } from "./MasterPage";

export interface GenericMasterConfigParams<T> {
  entityKey: MasterMetadataKey;
  apiPath: string; // 例: "/api/companies"
  metadata: MasterMetadata<T>;
  title: string;
  listTitle?: string;
  emptyMessage?: string;
  deleteConfirmMessage?: string;
}

export function useGenericMasterConfig<T extends { id?: string | null }>({
  entityKey,
  apiPath,
  metadata,
  title,
  listTitle,
  emptyMessage = "データがありません。「新規作成」ボタンから追加してください。",
  deleteConfirmMessage = "この項目を削除しますか？関連データがある場合、削除できないことがあります。",
}: GenericMasterConfigParams<T>): MasterPageConfig<T> {
  const getList = async (): Promise<T[]> => {
    // any を使って動的パスへの GET を呼び出す
    const data = await unwrap((apiClient.GET as any)(apiPath));
    return Array.isArray(data) ? data : [];
  };

  const createItem = async (payload: Partial<T>) => {
    try {
      await unwrap((apiClient.POST as any)(apiPath, { body: payload }));
    } catch (err) {
      notify.error("作成に失敗しました。", err, { feature: "master", action: "create" });
      throw err;
    }
  };

  const updateItem = async (id: string, payload: Partial<T>) => {
    try {
      await unwrap(
        (apiClient.PUT as any)(`${apiPath}/{item_id}`, {
          params: { path: { item_id: id } },
          body: payload,
        })
      );
    } catch (err) {
      notify.error("保存に失敗しました。", err, { feature: "master", action: "update" });
      throw err;
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await unwrap(
        (apiClient.DELETE as any)(`${apiPath}/{item_id}`, {
          params: { path: { item_id: id } },
        })
      );
    } catch (err) {
      notify.error("削除に失敗しました。", err, { feature: "master", action: "delete" });
      throw err;
    }
  };

  const getRefOptions: GetRefOptions = useCallback(async (refTarget) => {
    try {
      const path = `/api/${refTarget}` as any;
      const data = await unwrap((apiClient.GET as any)(path));
      return Array.isArray(data) ? (data as Array<{ id: string; [k: string]: unknown }>) : [];
    } catch {
      return [];
    }
  }, []);

  return {
    listKey: entityKey,
    getList,
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
