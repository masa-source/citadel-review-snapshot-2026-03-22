/**
 * スキーマの単一情報源（Single Source of Truth）のエフェクティブラッパー。
 * 実際の定数（TABLE_KEYS, FOREIGN_KEYS, TABLE_LABELS, IMPORT_ORDER）は
 * scripts/generate-schema.mjs によりビルド時に動的生成されます。
 */

import { TABLE_KEYS, FOREIGN_KEYS, TABLE_LABELS, IMPORT_ORDER } from "./schemaRegistry.generated";
import type { DatabaseSchema } from "./schema";

export { TABLE_KEYS, FOREIGN_KEYS, TABLE_LABELS, IMPORT_ORDER };

/**
 * FOREIGN_KEYS に基づき、親→子の依存順（トポロジカルソート）でインポート順序を返す関数。
 * 本来はビルド時に事前計算された IMPORT_ORDER をそのまま使用すべきですが、
 * 既存コード互換性のために同じく事前計算された IMPORT_ORDER を返す関数として残します。
 */
export function getImportOrder(): (keyof DatabaseSchema)[] {
  return IMPORT_ORDER;
}
