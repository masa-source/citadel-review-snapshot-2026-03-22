/**
 * UUID 生成ユーティリティ（npm uuid パッケージのラッパー）
 * クライアント側でレコード作成時に使用。
 */

import { v4 } from "uuid";

/** UUID v4 を生成する */
export function generateUUID(): string {
  return v4();
}
