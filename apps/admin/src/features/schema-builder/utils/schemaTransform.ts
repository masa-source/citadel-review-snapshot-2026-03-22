import type { RJSFSchema } from "@rjsf/utils";
import type { BuilderField, BuilderFieldType } from "../types";

const UI_ORDER_KEY = "ui:order" as const;
const UI_WIDGET_KEY = "ui:widget" as const;

/** 1フィールドの JSON Schema プロパティ値を生成 */
function buildPropertySchema(f: BuilderField): Record<string, unknown> {
  const prop: Record<string, unknown> = {
    title: f.title || f.id,
    description: f.description ?? undefined,
  };
  if (f.fieldType === "list") {
    return { ...prop, type: "array", items: { type: "string" } };
  }
  switch (f.fieldType) {
    case "text":
    case "textarea":
      prop.type = "string";
      break;
    case "number":
      prop.type = "number";
      break;
    case "date":
      prop.type = "string";
      prop.format = "date";
      break;
    case "dropdown":
    case "radio":
      prop.type = "string";
      if (f.enum && f.enum.length > 0) prop.enum = f.enum;
      break;
    case "time":
      prop.type = "string";
      prop.format = "time";
      break;
    case "checkbox":
      prop.type = "boolean";
      break;
    default:
      prop.type = "string";
  }
  return prop;
}

/** BuilderField[] から type: object 用の properties と required を生成 */
function buildObjectSchemaFromFields(fields: BuilderField[]): {
  properties: Record<string, unknown>;
  required: string[];
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    if (!f.id.trim()) continue;
    properties[f.id] = buildPropertySchema(f);
    if (f.required) required.push(f.id);
  }
  return {
    properties,
    required,
  };
}

/**
 * BuilderField[] を RJSF 用の JSON Schema に変換する。
 */
export function builderFieldsToJsonSchema(fields: BuilderField[]): RJSFSchema {
  const { properties, required } = buildObjectSchemaFromFields(fields);
  return {
    type: "object",
    properties: properties as RJSFSchema["properties"],
    ...(required.length > 0 ? { required } : {}),
  };
}

/** 1フィールドの UI Schema の widget 部分 */
function buildFieldUiSchema(f: BuilderField): Record<string, unknown> | null {
  const fieldUi: Record<string, unknown> = {};
  switch (f.fieldType) {
    case "textarea":
      fieldUi[UI_WIDGET_KEY] = "textarea";
      break;
    case "date":
      fieldUi[UI_WIDGET_KEY] = "date";
      break;
    case "radio":
      fieldUi[UI_WIDGET_KEY] = "radio";
      break;
    case "time":
      fieldUi[UI_WIDGET_KEY] = "time";
      break;
    default:
      break;
  }
  return Object.keys(fieldUi).length > 0 ? fieldUi : null;
}

/** 複数フィールド用の UI Schema（items 内やルート）。ui:order と各キーの widget を返す */
function buildUiSchemaForFields(fields: BuilderField[]): Record<string, unknown> {
  const order = fields.filter((f) => f.id.trim()).map((f) => f.id);
  const result: Record<string, unknown> = {
    [UI_ORDER_KEY]: order,
  };
  for (const f of fields) {
    if (!f.id.trim()) continue;
    const fieldUi = buildFieldUiSchema(f);
    const merged = fieldUi ?? {};
    if (Object.keys(merged).length > 0) result[f.id] = merged;
  }
  return result;
}

/**
 * BuilderField[] を RJSF 用の UI Schema に変換する。
 * ルートに ui:order を出力し、BuilderField[] の並び順を RJSF で保証する。
 */
export function builderFieldsToUiSchema(fields: BuilderField[]): Record<string, unknown> {
  return buildUiSchemaForFields(fields);
}

/**
 * JSON Schema の type / format / enum と UI Schema の ui:widget から BuilderFieldType を推定する。
 */
function inferFieldType(
  type: unknown,
  format: unknown,
  enumVal: unknown,
  uiWidget: unknown
): BuilderFieldType {
  if (type === "boolean") return "checkbox";
  if (type === "number" || type === "integer") return "number";
  if (type === "string") {
    if (format === "date" || uiWidget === "date") return "date";
    if (format === "time" || uiWidget === "time") return "time";
    if (uiWidget === "textarea") return "textarea";
    if (uiWidget === "radio") return "radio";
    if (Array.isArray(enumVal) && enumVal.length > 0) return "dropdown";
    return "text";
  }
  if (type === "array") return "list";
  return "text";
}

/**
 * 既存の jsonSchema と uiSchema から BuilderField[] を復元する。
 * ui:order が存在する場合はその順序でソートする。
 * type: array の場合は items.properties を subFields として再帰的にパースする。
 */
export function schemasToBuilderFields(
  jsonSchema: Record<string, unknown> | null | undefined,
  uiSchema: Record<string, unknown> | null | undefined
): BuilderField[] {
  return parsePropertiesToBuilderFields(
    (jsonSchema ?? {}).properties as Record<string, Record<string, unknown>> | undefined,
    (uiSchema ?? {}) as Record<string, unknown>,
    new Set(
      Array.isArray((jsonSchema ?? {}).required) ? ((jsonSchema ?? {}).required as string[]) : []
    )
  );
}

function parsePropertiesToBuilderFields(
  props: Record<string, Record<string, unknown>> | undefined,
  ui: Record<string, unknown>,
  requiredSet: Set<string>,
  order?: string[]
): BuilderField[] {
  if (!props || typeof props !== "object") return [];

  const orderList =
    order ??
    (Array.isArray(ui[UI_ORDER_KEY])
      ? (ui[UI_ORDER_KEY] as string[]).filter((k) => typeof k === "string")
      : []);

  const list: BuilderField[] = [];
  const seen = new Set<string>();

  const processKey = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const prop = props[key];
    if (!prop || typeof prop !== "object") return;
    const type = prop.type as unknown;
    const format = prop.format as unknown;
    const enumVal = prop.enum as unknown;
    const fieldUi = (ui[key] as Record<string, unknown>) ?? {};
    const uiWidget = fieldUi[UI_WIDGET_KEY];

    const fieldType = inferFieldType(type, format, enumVal, uiWidget);

    const field: BuilderField = {
      id: key,
      fieldType,
      title: (prop.title as string) ?? key,
      description: (prop.description as string) ?? undefined,
      required: requiredSet.has(key),
      enum: Array.isArray(enumVal) ? (enumVal as string[]) : undefined,
    };
    list.push(field);
  };

  if (orderList.length > 0) {
    for (const key of orderList) {
      if (Object.prototype.hasOwnProperty.call(props, key)) processKey(key);
    }
    for (const key of Object.keys(props)) {
      processKey(key);
    }
  } else {
    for (const key of Object.keys(props)) {
      processKey(key);
    }
  }

  return list;
}
