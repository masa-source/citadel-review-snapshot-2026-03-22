/**
 * スキーマビルダーの中間表現型。
 * GUI の State は BuilderField[] で保持し、保存時に jsonSchema / uiSchema へ変換する。
 */

/** フィールド種別（パレットの要素と 1:1） */
export type BuilderFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "dropdown"
  | "checkbox"
  | "radio"
  | "time"
  | "list";

/** 1 フィールドを表す中間表現（キャンバス上の並び順 = 配列の要素順） */
export interface BuilderField {
  /** 一意キー。JSON Schema の property key として使用。英数字・アンダースコア推奨 */
  id: string;
  /** パレットで選んだ種別 */
  fieldType: BuilderFieldType;
  /** ラベル（RJSF の title） */
  title: string;
  /** 説明文（RJSF の description） */
  description?: string;
  /** 必須フラグ（required 配列に含めるか） */
  required?: boolean;
  /** ドロップダウン・ラジオの選択肢。fieldType === "dropdown" | "radio" のとき使用 */
  enum?: string[];
}

/**
 * パレットからフィールドを新規追加したときに使用する、ユニークな初期 id を生成する。
 * 形式: field_<timestamp>_<shortRandom>（例: field_1730123456789_x7k2m）
 */
export function generateBuilderFieldId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `field_${timestamp}_${random}`;
}
