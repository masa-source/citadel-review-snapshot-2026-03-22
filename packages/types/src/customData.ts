/**
 * customData（Report / TargetInstrument の動的フィールド）の Parse, don't validate。
 * API/DB 由来の unknown を「オブジェクト or 空オブジェクト」にパースし、境界で型を保証する。
 */

import { z } from "zod";

const customDataSchema = z
  .unknown()
  .nullable()
  .transform((v): Record<string, unknown> => {
    if (v == null) return {};
    if (typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return {};
  });

/**
 * API/DB 由来の unknown を customData としてパースする。
 * オブジェクトであればそのまま返し、null・配列・文字列などは空オブジェクト {} にフォールバックする。
 */
export function parseCustomData(value: unknown): Record<string, unknown> {
  return customDataSchema.parse(value);
}
