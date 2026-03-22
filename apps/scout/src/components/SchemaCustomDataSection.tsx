import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getRepository } from "@/services/data";
import { CustomDataForm } from "@/components/CustomDataForm";

export type SchemaTargetEntity = "report" | "targetInstrument";

export interface SchemaCustomDataSectionProps {
  /** スキーマの対象エンティティ（この値で一覧をフィルタ） */
  targetEntity: SchemaTargetEntity;
  /** 選択中のスキーマID */
  schemaId: string;
  /** スキーマ変更時（呼び出し側で setValue + setCustomData({}) を行うこと） */
  onSchemaIdChange: (id: string) => void;
  /** カスタムデータの現在値 */
  customData: Record<string, unknown>;
  /** カスタムデータ変更時 */
  onCustomDataChange: (data: Record<string, unknown>) => void;
  /** 読み取り専用 */
  readOnly?: boolean;
  /** セクション見出し */
  sectionTitle?: string;
  /** スキーマ選択のラベル */
  selectLabel?: string;
  /** フォーム全体の className */
  className?: string;
}

/**
 * スキーマ選択の select と CustomDataForm をまとめた共用コンポーネント。
 * レポート編集・対象機器編集の両方で利用する。
 */
export function SchemaCustomDataSection({
  targetEntity,
  schemaId,
  onSchemaIdChange,
  customData,
  onCustomDataChange,
  readOnly = false,
  sectionTitle = "カスタムデータ（スキーマ定義）",
  selectLabel,
  className,
}: SchemaCustomDataSectionProps): React.ReactElement {
  const schemaRepo = getRepository("schemaDefinitions");
  const schemaDefinitionsAll = useLiveQuery(() => schemaRepo.list(), [schemaRepo]);
  const schemaList = useMemo(
    () => (schemaDefinitionsAll ?? []).filter((s) => s.targetEntity === targetEntity),
    [schemaDefinitionsAll, targetEntity]
  );
  const schemaDefinition = useLiveQuery(
    () => (schemaId ? schemaRepo.get(schemaId) : Promise.resolve(null)),
    [schemaId, schemaRepo]
  );

  const defaultSelectLabel =
    targetEntity === "report"
      ? "報告書用フォーマット（スキーマ）"
      : "対象機器用フォーマット（スキーマ）";
  const label = selectLabel ?? defaultSelectLabel;

  return (
    <section className={className}>
      <h2 className="mb-4 text-base font-semibold text-gray-800">{sectionTitle}</h2>
      <div className="mb-4">
        <label
          htmlFor="schema-custom-data-schema-id"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
        <select
          id="schema-custom-data-schema-id"
          value={schemaId ?? ""}
          onChange={(e) => onSchemaIdChange(e.target.value)}
          disabled={readOnly}
          className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
        >
          <option value="">— 選択 —</option>
          {schemaList.map((s) => (
            <option key={s.id} value={s.id ?? ""}>
              {s.targetEntity ?? ""} / v{s.version ?? "—"}
            </option>
          ))}
        </select>
      </div>
      {schemaId && schemaDefinition && (
        <CustomDataForm
          schema={schemaDefinition.jsonSchema ?? undefined}
          uiSchema={schemaDefinition.uiSchema ?? undefined}
          formData={customData}
          onChange={onCustomDataChange}
          readOnly={readOnly}
          className="bg-transparent"
        />
      )}
    </section>
  );
}
