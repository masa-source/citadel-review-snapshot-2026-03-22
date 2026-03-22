/* eslint-disable @typescript-eslint/no-explicit-any */
import { MASTER_METADATA } from "@citadel/ui";
import type { ScoutMasterConfig } from "./ScoutMasterPage";
import { useGenericScoutMasterConfig } from "./useGenericScoutMasterConfig";

export type ScoutMasterEntity =
  | "companies"
  | "workers"
  | "sites"
  | "instruments"
  | "owned-instruments"
  | "parts"
  | "schema-definitions"
  | "table-definitions";

const entityMetaMap: Record<
  ScoutMasterEntity,
  { title: string; listTitle: string; repoKey?: string }
> = {
  companies: { title: "会社マスタ", listTitle: "会社一覧" },
  workers: { title: "作業者マスタ", listTitle: "作業者一覧" },
  sites: { title: "現場マスタ", listTitle: "現場一覧" },
  instruments: { title: "計器マスタ", listTitle: "計器一覧" },
  "owned-instruments": {
    title: "所有計器マスタ",
    listTitle: "所有計器一覧",
    repoKey: "ownedInstruments",
  },
  parts: { title: "部品マスタ", listTitle: "部品一覧" },
  "schema-definitions": {
    title: "スキーマ定義マスタ",
    listTitle: "スキーマ定義一覧",
    repoKey: "schemaDefinitions",
  },
  "table-definitions": {
    title: "テーブル定義マスタ",
    listTitle: "テーブル定義一覧",
    repoKey: "tableDefinitions",
  },
};

export function useDynamicScoutMasterConfig(entityKey: ScoutMasterEntity): ScoutMasterConfig<any> {
  const meta = entityMetaMap[entityKey];
  return useGenericScoutMasterConfig({
    entityKey,
    repoKey: meta.repoKey,
    metadata: MASTER_METADATA[entityKey] as any,
    title: meta.title,
    listTitle: meta.listTitle,
  });
}
