import React, { useMemo } from "react";
import Form, { getDefaultRegistry } from "@rjsf/core";
import type { BaseInputTemplateProps, RegistryWidgetsType, RJSFSchema } from "@rjsf/utils";
import { customizeValidator } from "@rjsf/validator-ajv8";
import { RefSelectWidget } from "./widgets/RefSelectWidget";

const validator = customizeValidator({});

const {
  templates: { BaseInputTemplate: DefaultBaseInputTemplate },
} = getDefaultRegistry();

/**
 * input[value] にオブジェクトが渡ると cannot be parsed になるため、value をプリミティブに強制する
 */
function SafeBaseInputTemplate(props: BaseInputTemplateProps): React.ReactElement {
  const isObject =
    typeof props.value === "object" && props.value !== null && !Array.isArray(props.value);
  const schemaType = props.schema?.type;
  const emptyByType = schemaType === "number" ? 0 : schemaType === "boolean" ? false : "";
  let safeValue: unknown = isObject ? emptyByType : props.value;
  if (safeValue === null)
    safeValue = schemaType === "number" ? 0 : schemaType === "boolean" ? false : "";
  return <DefaultBaseInputTemplate {...props} value={safeValue} />;
}

/** RefSelect 等で参照先一覧を取得するために formContext に渡す getRefOptions の型 */
export type GetRefOptions = (
  refTarget: string
) => Promise<Array<{ id: string; [k: string]: unknown }>>;

export interface GenericDynamicFormProps {
  /** JSON Schema */
  schema: RJSFSchema;
  /** UI Schema (オプション) */
  uiSchema?: Record<string, unknown>;
  /** フォームの初期値 */
  formData?: Record<string, unknown> | null;
  /**
   * 変更時のコールバック
   * handleSubmit が呼ばれる前に都度発火します。
   */
  onChange?: (data: Record<string, unknown>) => void;
  /** サブミット時のコールバック */
  onSubmit?: (data: Record<string, unknown>) => void;
  readOnly?: boolean;
  className?: string;
  /** RJSF の formContext（RefSelectWidget は getRefOptions を参照） */
  formContext?: Record<string, unknown>;
  /** 追加のカスタムウィジェット（refSelect はデフォルトで登録済み） */
  widgets?: Partial<RegistryWidgetsType>;
}

/**
 * RJSF を元にした汎用の動的フォームコンポーネント
 */
const defaultWidgets = {
  refSelect: RefSelectWidget,
} satisfies RegistryWidgetsType;

export function GenericDynamicForm({
  schema,
  uiSchema,
  formData,
  onChange,
  onSubmit,
  readOnly = false,
  className,
  formContext,
  widgets: customWidgets,
}: GenericDynamicFormProps): React.ReactElement | null {
  const safeFormData = useMemo(() => {
    const raw = formData ?? {};
    // RJSF の HiddenWidget は value===null をそのまま input に渡すため React が警告する。null は "" に正規化する。
    const normalized: Record<string, unknown> = {};
    for (const k of Object.keys(raw)) {
      const v = raw[k];
      normalized[k] = v === null ? "" : v;
    }
    // #region agent log
    const nullKeys = Object.keys(raw).filter((k) => raw[k] === null);
    if (nullKeys.length > 0) {
      fetch("http://127.0.0.1:7242/ingest/94b6906e-07df-4dad-90e1-9efb8f6f10ac", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3b969d" },
        body: JSON.stringify({
          sessionId: "3b969d",
          location: "GenericDynamicForm.tsx:safeFormData",
          message: "formData keys normalized from null to empty string",
          data: { nullKeys, runId: "post-fix" },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
    // #endregion
    return normalized;
  }, [formData, schema]);

  const widgets = useMemo(
    () =>
      customWidgets
        ? ({ ...defaultWidgets, ...customWidgets } as RegistryWidgetsType)
        : defaultWidgets,
    [customWidgets]
  );

  return (
    <div className={className ? `rjsf ${className}` : "rjsf"}>
      <Form
        schema={schema}
        uiSchema={uiSchema ?? {}}
        formData={safeFormData}
        validator={validator}
        readonly={readOnly}
        formContext={formContext}
        widgets={widgets}
        onChange={(e) => {
          if (onChange) onChange(e.formData);
        }}
        onSubmit={(e) => {
          if (onSubmit) onSubmit(e.formData);
        }}
        templates={{
          BaseInputTemplate: SafeBaseInputTemplate,
          ButtonTemplates: {
            SubmitButton: () => null, // 自前の保存ボタンで submit する想定なので非表示
          },
        }}
      />
    </div>
  );
}
