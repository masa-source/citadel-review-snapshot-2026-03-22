import type { BuilderFieldType } from "./types";

/** パレットに表示するフィールド種別とラベル */
export const PALETTE_ITEMS: { type: BuilderFieldType; label: string }[] = [
  { type: "text", label: "テキスト(1行)" },
  { type: "textarea", label: "テキスト(複数行)" },
  { type: "number", label: "数値" },
  { type: "date", label: "日付" },
  { type: "time", label: "時間" },
  { type: "dropdown", label: "ドロップダウン" },
  { type: "radio", label: "ラジオボタン" },
  { type: "checkbox", label: "チェックボックス" },
  { type: "list", label: "リスト(複数項目)" },
];

export const FIELD_TYPE_LABELS: Record<BuilderFieldType, string> = {
  text: "テキスト(1行)",
  textarea: "テキスト(複数行)",
  number: "数値",
  date: "日付",
  time: "時間",
  dropdown: "ドロップダウン",
  radio: "ラジオボタン",
  checkbox: "チェックボックス",
  list: "リスト(複数項目)",
};
