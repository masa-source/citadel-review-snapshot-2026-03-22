/* eslint-disable @typescript-eslint/no-explicit-any */
import { useNavigate } from "react-router-dom";
import { MASTER_METADATA } from "@citadel/ui";
import type { MasterPageConfig } from "@/components/masters/MasterPage";
import { useGenericMasterConfig } from "./useGenericMasterConfig";
import { TableDefinitionFormSlot } from "./TableDefinitionFormSlot";

export type AdminMasterEntity =
  | "companies"
  | "workers"
  | "sites"
  | "instruments"
  | "owned-instruments"
  | "parts"
  | "schema-definitions"
  | "table-definitions";

const entityMetaMap: Record<AdminMasterEntity, { title: string; listTitle: string }> = {
  companies: { title: "会社マスタ", listTitle: "会社一覧" },
  workers: { title: "作業者マスタ", listTitle: "作業者一覧" },
  sites: { title: "現場マスタ", listTitle: "現場一覧" },
  instruments: { title: "計器マスタ", listTitle: "計器一覧" },
  "owned-instruments": { title: "所有計器マスタ", listTitle: "所有計器一覧" },
  parts: { title: "部品マスタ", listTitle: "部品一覧" },
  "schema-definitions": { title: "スキーマ定義マスタ", listTitle: "スキーマ定義一覧" },
  "table-definitions": { title: "テーブル定義マスタ", listTitle: "テーブル定義一覧" },
};

export function useDynamicMasterConfig(entityKey: AdminMasterEntity): MasterPageConfig<any> {
  const navigate = useNavigate();
  const meta = entityMetaMap[entityKey];
  const config = {
    ...useGenericMasterConfig({
      entityKey,
      apiPath: `/api/${entityKey}`,
      metadata: MASTER_METADATA[entityKey] as any,
      title: meta.title,
      listTitle: meta.listTitle,
    }),
  };

  if (entityKey === "schema-definitions") {
    config.onEditOverride = (item) => {
      const id = item?.id;
      if (id) navigate(`/masters/schema-definitions/${id}/builder`);
    };
    config.customActions = (item) => {
      const id = item?.id;
      if (!id) return null;
      return (
        <button
          type="button"
          onClick={() => navigate(`/masters/schema-definitions/${id}/builder`)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          ビルダー
        </button>
      );
    };
  }

  if (entityKey === "table-definitions") {
    config.formSlot = (props) => <TableDefinitionFormSlot {...props} />;
  }

  return config;
}
