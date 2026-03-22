import { useMemo } from "react";
import Form, { getDefaultRegistry } from "@rjsf/core";
import type { BaseInputTemplateProps, RJSFSchema } from "@rjsf/utils";
import { customizeValidator } from "@rjsf/validator-ajv8";

const validator = customizeValidator({});
import { parseCustomData } from "@citadel/types";

const {
  templates: { BaseInputTemplate: DefaultBaseInputTemplate },
} = getDefaultRegistry();

/** input[value] にオブジェクトが渡ると "cannot be parsed" になるため、value をプリミティブに強制する。型に合わせた空値を使う。 */
function SafeBaseInputTemplate(props: BaseInputTemplateProps): React.ReactElement {
  const isObject =
    typeof props.value === "object" && props.value !== null && !Array.isArray(props.value);
  const schemaType = props.schema?.type;
  const emptyByType = schemaType === "number" ? 0 : schemaType === "boolean" ? false : "";
  const safeValue = isObject ? emptyByType : props.value;
  return <DefaultBaseInputTemplate {...props} value={safeValue} />;
}

/** input[value] にオブジェクトが渡ると "[object Object] cannot be parsed" になるため、スキーマに沿ってプリミティブでない値を正規化する */
function normalizeFormDataForRjsf(
  data: Record<string, unknown>,
  schema: RJSFSchema
): Record<string, unknown> {
  const props = schema.properties;
  if (!props || typeof props !== "object") return { ...data };

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    const val = data[key];
    const propSchema = props[key];
    const subSchema =
      propSchema && typeof propSchema === "object" ? (propSchema as RJSFSchema) : undefined;

    if (!subSchema) {
      out[key] = val;
      continue;
    }

    const t = subSchema.type;
    if (t === "string" || t === "number" || t === "boolean") {
      if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        out[key] = t === "number" ? 0 : t === "boolean" ? false : "";
      } else {
        out[key] = val;
      }
      continue;
    }

    if (t === "array" && subSchema.items) {
      const itemsSchema = subSchema.items as RJSFSchema;
      if (!Array.isArray(val)) {
        out[key] = val;
        continue;
      }
      const itemType = itemsSchema.type;
      if (itemType === "string" || itemType === "number" || itemType === "boolean") {
        out[key] = (val as unknown[]).map((v) =>
          typeof v === "object" && v !== null && !Array.isArray(v) ? "" : v
        );
      } else {
        out[key] = val;
      }
      continue;
    }

    if (t === "object" && subSchema.properties) {
      out[key] =
        typeof val === "object" && val !== null && !Array.isArray(val)
          ? normalizeFormDataForRjsf(val as Record<string, unknown>, subSchema)
          : val;
      continue;
    }

    out[key] = val;
  }
  return out;
}

export interface CustomDataFormProps {
  /** JSON Schema for the form (target_entity 用)。空の場合は何も表示しない */
  schema: RJSFSchema | null | undefined;
  /** 表示用 UI Schema（オプション） */
  uiSchema?: Record<string, unknown>;
  /** 現在のフォーム値 */
  formData?: Record<string, unknown> | null;
  /** 値変更時のコールバック */
  onChange?: (data: Record<string, unknown>) => void;
  /** 読み取り専用 */
  readOnly?: boolean;
  /** フォームの className */
  className?: string;
}

/**
 * スキーマ定義の jsonSchema に基づき RJSF で customData を編集するフォーム。
 */
export function CustomDataForm({
  schema,
  uiSchema,
  formData,
  onChange,
  readOnly = false,
  className,
}: CustomDataFormProps): React.ReactElement | null {
  const effectiveSchema = useMemo(() => {
    if (!schema || typeof schema !== "object") return null;
    const s = schema as RJSFSchema;
    if (s.type !== "object" && !s.properties) {
      return { type: "object" as const, properties: s.properties ?? {} };
    }
    return s;
  }, [schema]);

  const rawData = useMemo(
    () => (formData && typeof formData === "object" ? formData : {}),
    [formData]
  );
  const data = useMemo(
    () => (effectiveSchema ? normalizeFormDataForRjsf(rawData, effectiveSchema) : rawData),
    [rawData, effectiveSchema]
  );

  if (!effectiveSchema) return null;

  return (
    <div className={className ? `rjsf ${className}` : "rjsf"}>
      <Form
        schema={effectiveSchema}
        uiSchema={uiSchema ?? {}}
        formData={data}
        validator={validator}
        readonly={readOnly}
        onChange={(e) => {
          onChange?.(parseCustomData(e.formData));
        }}
        templates={{
          BaseInputTemplate: SafeBaseInputTemplate,
          ButtonTemplates: {
            SubmitButton: () => null,
          },
        }}
      />
    </div>
  );
}
