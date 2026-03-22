/**
 * プレースホルダ自動マッチング用の純粋関数。
 * コンテキストのフラット化・パス優先・value→path マップ・除外判定など。
 */

/** システムメタデータとして再帰走査・表示の両方で除外するキー */
export const HIDDEN_KEYS = new Set<string>([
  "id",
  "createdAt",
  "updatedAt",
  "sortOrder",
  "isLocal",
  "reportSnapshot",
]);

/** 末尾が Id のキーも除外するかどうかの判定用 */
export function isHiddenKey(key: string): boolean {
  return HIDDEN_KEYS.has(key) || key.endsWith("Id");
}

/** Ordered リストのキー（0番目はNone、1始まりで [1], [2] とアクセスする） */
const ORDERED_LIST_KEYS = new Set<string>([
  "reportClientsOrdered",
  "reportWorkersOrdered",
  "targetInstrumentsOrdered",
  "reportOwnedInstrumentsOrdered",
  "usedPartsOrdered",
]);

/** ネストした Ordered リスト（対象計器の表など）。walk で [1]～[n] のみ展開する */
const NESTED_ORDERED_LIST_KEYS = new Set<string>(["tablesOrdered"]);

/** キーにハイフンを含む、または完全な数値のときブラケット記法 ['key'] を使う（Jinja2 準拠） */
export function shouldUseBracketNotation(key: string): boolean {
  return key.includes("-") || /^\d+$/.test(key);
}

/** パスにセグメントを追加。ハイフン・数値キーは ['key'] 形式にする。 */
export function appendPathSegment(prefix: string, segment: string): string {
  const escaped = segment.replace(/'/g, "\\'");
  if (shouldUseBracketNotation(segment)) {
    return prefix ? `${prefix}['${escaped}']` : segment;
  }
  return prefix ? `${prefix}.${segment}` : segment;
}

/** 完全一致でマッチさせない値（誤爆防止） */
export const EXCLUDED_MATCH_VALUES = new Set([
  "なし",
  "あり",
  "-",
  "－",
  "—",
  "・",
  "…",
  "○",
  "×",
  "△",
  "／",
  "・",
  " ",
  "",
]);

/** context を再帰走査して { path, value } のフラットリストを作る。Ordered[1] 等の論理キー参照のみ展開し、生配列の [0],[1] は展開しない。 */
export function flattenContextToPaths(
  obj: unknown,
  basePath: string
): { path: string; value: string }[] {
  const out: { path: string; value: string }[] = [];
  if (obj === null || obj === undefined) return out;

  if (typeof obj === "object" && !Array.isArray(obj)) {
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      if (isHiddenKey(key)) continue;
      const nextPath = appendPathSegment(basePath, key);
      if (Array.isArray(val) && ORDERED_LIST_KEYS.has(key)) {
        for (let i = 1; i < val.length; i++) {
          const elem = val[i];
          if (elem == null) continue;
          const orderedPath = basePath ? `${basePath}.${key}[${i}]` : `${key}[${i}]`;
          out.push(...flattenContextToPaths(elem, orderedPath));
        }
        continue;
      }
      if (Array.isArray(val) && NESTED_ORDERED_LIST_KEYS.has(key)) {
        for (let i = 1; i < val.length; i++) {
          const elem = val[i];
          if (elem == null) continue;
          const orderedPath = basePath ? `${basePath}.${key}[${i}]` : `${key}[${i}]`;
          out.push(...flattenContextToPaths(elem, orderedPath));
        }
        continue;
      }
      if (Array.isArray(val) && key === "rows") {
        const isArrayOfObjects =
          val.length === 0 ||
          val.every((v) => v != null && typeof v === "object" && !Array.isArray(v));
        if (isArrayOfObjects) {
          for (let i = 0; i < val.length; i++) {
            const elem = val[i];
            if (elem == null) continue;
            const rowsPath = basePath ? `${basePath}.rows[${i}]` : `rows[${i}]`;
            out.push(...flattenContextToPaths(elem, rowsPath));
          }
        }
        continue;
      }
      if (Array.isArray(val)) {
        const allPrimitive = val.every(
          (v) =>
            v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        );
        if (allPrimitive) {
          for (let i = 0; i < val.length; i++) {
            const v = val[i];
            if (v == null) continue;
            const arrPath = basePath ? `${basePath}.${key}[${i}]` : `${key}[${i}]`;
            out.push({ path: arrPath, value: String(v) });
          }
        }
        continue;
      }
      out.push(...flattenContextToPaths(val, nextPath));
    }
    return out;
  }
  if (Array.isArray(obj)) return out;

  const value = String(obj);
  out.push({ path: basePath, value });
  return out;
}

/** Ordered[n] 形式（reportWorkersOrdered[1] 等）のパスかどうか。Jinja2/JS 標準のリスト添字。 */
export function isOrderedPath(path: string): boolean {
  return /\w+Ordered\[\d+\]/.test(path);
}

/** キー参照パスかどうか（ByRole / ById / ByWorkerId / ByTagNumber を含む） */
export function isKeyPath(path: string): boolean {
  const p = path;
  return (
    p.includes("ByRole") ||
    p.includes("ById") ||
    p.includes("ByWorkerId") ||
    p.includes("ByTagNumber")
  );
}

/** 1件目・Primary パスかどうか */
export function isPrimaryPath(path: string): boolean {
  return path.includes("Primary");
}

/** マッチング戦略: ordered=連番優先, key=キー・役割優先, primary=1件目・Primary優先 */
export type MatchStrategy = "ordered" | "key" | "primary";

/**
 * 同じ値に対し複数パスがある場合の優先。strategy に応じて順位を変更。
 * ordered: Ordered > キー参照 > 短いパス（Primary等）
 * key: キー参照 > Ordered > 短いパス
 * primary: 短いパス（Primary等）> Ordered > キー参照
 */
export function choosePath(a: string, b: string, strategy: MatchStrategy = "ordered"): string {
  const orderedA = isOrderedPath(a);
  const orderedB = isOrderedPath(b);
  const keyA = isKeyPath(a);
  const keyB = isKeyPath(b);

  const scoreA =
    strategy === "ordered"
      ? orderedA
        ? 3
        : keyA
          ? 2
          : 0
      : strategy === "key"
        ? keyA
          ? 3
          : orderedA
            ? 2
            : 0
        : a.length < b.length
          ? 3
          : orderedA
            ? 2
            : keyA
              ? 1
              : 0;

  const scoreB =
    strategy === "ordered"
      ? orderedB
        ? 3
        : keyB
          ? 2
          : 0
      : strategy === "key"
        ? keyB
          ? 3
          : orderedB
            ? 2
            : 0
        : b.length < a.length
          ? 3
          : orderedB
            ? 2
            : keyB
              ? 1
              : 0;

  if (scoreA !== scoreB) return scoreA > scoreB ? a : b;
  return a.length <= b.length ? a : b;
}

/** 値 -> 1つのパスに集約（競合解決済み）。strategy に応じて choosePath の優先順位を変更。配列添字 [ を含むパスは候補から除外。 */
export function buildValueToPathMap(
  flat: { path: string; value: string }[],
  strategy: MatchStrategy = "ordered"
): Map<string, string> {
  const byValue = new Map<string, string[]>();
  for (const { path, value } of flat) {
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value)!.push(path);
  }
  const result = new Map<string, string>();
  byValue.forEach((paths, value) => {
    const stablePaths = paths.filter((p) => !p.includes("[") || isOrderedPath(p));
    if (stablePaths.length === 0) return;
    const chosen = stablePaths.reduce((acc, p) => choosePath(acc, p, strategy));
    result.set(value, chosen);
  });
  return result;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** パスのプレフィックスからカテゴリ名を返す（PlaceholderList のグループ表示用） */
export function getCategoryForPath(path: string): string {
  const p = path.trim();
  if (!p) return "その他";
  if (
    p === "reportTitle" ||
    p.startsWith("company.") ||
    /^(controlNumber|createdAt|reportType)(\.|$)/.test(p)
  )
    return "基本情報";
  if (p.startsWith("reportWorker") || p.startsWith("reportWorkers")) return "作業者";
  if (p.startsWith("targetInstrument") || p.startsWith("targetInstruments")) return "対象計器";
  if (p.startsWith("usedPart") || p.startsWith("usedParts")) return "使用部品";
  if (p.startsWith("reportClient") || p.startsWith("reportClients")) return "取引先";
  if (p.startsWith("reportOwnedInstrument")) return "所有計器";
  return "その他";
}

export interface PlaceholderListItem {
  category: string;
  path: string;
  previewValue: string;
}

/**
 * contextData を再帰走査し、末端のプリミティブのみをリスト化する。
 * オブジェクト・配列を指すパスは含めない（tables.IR_TEST.ZERO のような途中ノード挿入を防ぐ）。
 * targetInstrumentsById 等の ById マップ内オブジェクトの customData も再帰走査し、
 * targetInstrumentsById['xxx'].customData.fieldName 形式のパスを抽出する。
 */
export function buildPlaceholderList(contextData: unknown): PlaceholderListItem[] {
  const out: PlaceholderListItem[] = [];
  const seenPaths = new Set<string>();

  function pushUnique(item: PlaceholderListItem): void {
    if (seenPaths.has(item.path)) return;
    seenPaths.add(item.path);
    out.push(item);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 再帰のシグネチャ互換のため第3引数は未使用
  function walk(obj: unknown, basePath: string, _isRoot: boolean): void {
    if (obj === null || obj === undefined) return;

    if (typeof obj === "object" && !Array.isArray(obj)) {
      const record = obj as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (isHiddenKey(key)) continue;
        const nextPath = appendPathSegment(basePath, key);
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
          walk(value, nextPath, false);
        } else if (Array.isArray(value) && ORDERED_LIST_KEYS.has(key)) {
          for (let i = 1; i < value.length; i++) {
            const elem = value[i];
            if (elem == null) continue;
            const orderedPath = basePath ? `${basePath}.${key}[${i}]` : `${key}[${i}]`;
            walk(elem, orderedPath, false);
          }
        } else if (Array.isArray(value) && NESTED_ORDERED_LIST_KEYS.has(key)) {
          for (let i = 1; i < value.length; i++) {
            const elem = value[i];
            if (elem == null) continue;
            const orderedPath = basePath ? `${basePath}.${key}[${i}]` : `${key}[${i}]`;
            walk(elem, orderedPath, false);
          }
        } else if (Array.isArray(value) && key === "rows") {
          const isArrayOfObjects =
            value.length === 0 ||
            value.every((v) => v != null && typeof v === "object" && !Array.isArray(v));
          if (isArrayOfObjects) {
            pushUnique({
              category: getCategoryForPath(nextPath),
              path: nextPath,
              previewValue: `配列(${value.length}件)、ループ用`,
            });
            for (let i = 0; i < value.length; i++) {
              const row = value[i];
              if (row == null || typeof row !== "object" || Array.isArray(row)) continue;
              const rowPath = `${nextPath}[${i}]`;
              walk(row, rowPath, false);
            }
          } else {
            const allPrimitive = value.every(
              (v) =>
                v == null ||
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean"
            );
            if (allPrimitive) {
              for (let i = 0; i < value.length; i++) {
                const v = value[i];
                if (v == null) continue;
                const arrPath = basePath ? `${basePath}.${key}[${i}]` : `${key}[${i}]`;
                pushUnique({
                  category: getCategoryForPath(arrPath),
                  path: arrPath,
                  previewValue: String(v),
                });
              }
            }
          }
        } else if (Array.isArray(value)) {
          const allPrimitive = value.every(
            (v) =>
              v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean"
          );
          if (allPrimitive) {
            for (let i = 0; i < value.length; i++) {
              const v = value[i];
              if (v == null) continue;
              const arrPath = basePath ? `${basePath}.${key}[${i}]` : `${key}[${i}]`;
              pushUnique({
                category: getCategoryForPath(arrPath),
                path: arrPath,
                previewValue: String(v),
              });
            }
          }
        } else {
          pushUnique({
            category: getCategoryForPath(nextPath),
            path: nextPath,
            previewValue: String(value),
          });
        }
      }
      return;
    }

    if (Array.isArray(obj)) return;
  }

  /** ById マップ内の各要素の customData を再帰走査し、プリミティブを out に追加する */
  function walkCustomDataInByIdMap(
    byIdMap: Record<string, unknown> | null | undefined,
    mapKey: string
  ): void {
    if (!byIdMap || typeof byIdMap !== "object" || Array.isArray(byIdMap)) return;
    for (const [id, item] of Object.entries(byIdMap)) {
      if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
      const customData = (item as Record<string, unknown>).customData;
      if (customData == null || typeof customData !== "object" || Array.isArray(customData))
        continue;
      const basePath = shouldUseBracketNotation(id)
        ? `${mapKey}['${id.replace(/'/g, "\\'")}'].customData`
        : `${mapKey}.${id}.customData`;
      walk(customData, basePath, false);
    }
  }

  if (contextData !== null && typeof contextData === "object" && !Array.isArray(contextData)) {
    const ctx = contextData as Record<string, unknown>;
    walk(ctx, "", true);
    walkCustomDataInByIdMap(
      ctx.targetInstrumentsById as Record<string, unknown> | undefined,
      "targetInstrumentsById"
    );
    walkCustomDataInByIdMap(
      ctx.usedPartsById as Record<string, unknown> | undefined,
      "usedPartsById"
    );
    // 作成日は HIDDEN_KEYS で walk から除外されているため、プレースホルダ一覧用に明示的に追加
    if (ctx.createdAt !== undefined && ctx.createdAt !== null && !seenPaths.has("createdAt")) {
      pushUnique({
        category: "基本情報",
        path: "createdAt",
        previewValue: String(ctx.createdAt),
      });
    }
  }
  return out;
}

/** 3文字未満の数字のみ・UUID・既存プレースホルダ等を除外（自動スキャン対象外） */
export function isExcludedCellValue(str: string): boolean {
  const s = String(str).trim();
  if (s.length < 3 && /^\d+$/.test(s)) return true;
  if (EXCLUDED_MATCH_VALUES.has(s)) return true;
  if (/^\s*\{\{\s*.+\s*\}\}\s*$/.test(s)) return true; // 既にプレースホルダ
  if (UUID_REGEX.test(s)) return true; // UUID 形式はユーザーに不要なメタデータとして除外
  return false;
}

/** パスの性質に応じたバッジ（PlaceholderList の表示用） */
export interface PathBadge {
  type: "recommended" | "ordered" | "primary";
  label: string;
}

export function getPathBadges(path: string): PathBadge[] {
  const badges: PathBadge[] = [];
  const p = path;
  if (isKeyPath(p)) {
    badges.push({ type: "recommended", label: "キー参照" });
  }
  if (/\w+Ordered\[\d+\]/.test(p) || p.includes("Ordered")) {
    badges.push({ type: "ordered", label: "連番" });
  }
  if (p.includes("Primary")) {
    badges.push({ type: "primary", label: "1件目" });
  }
  return badges;
}

/** 推奨（安定）パスかどうか（ByRole / ById / ByWorkerId / ByTagNumber を含む） */
export function isRecommendedPath(path: string): boolean {
  const p = path;
  return (
    p.includes("ByRole") ||
    p.includes("ById") ||
    p.includes("ByWorkerId") ||
    p.includes("ByTagNumber")
  );
}

/** バッジ順（キー参照 > 連番 > 1件目）のソート用優先度 */
function badgeOrder(path: string): number {
  if (isKeyPath(path)) return 4;
  if (isOrderedPath(path)) return 3;
  if (isPrimaryPath(path)) return 2;
  return 0;
}

/** カテゴリ内の項目をバッジ順（キー参照 > 連番 > 1件目）でソート */
export function sortPlaceholderItemsByRecommendation(
  items: PlaceholderListItem[]
): PlaceholderListItem[] {
  return [...items].sort((a, b) => {
    const orderA = badgeOrder(a.path);
    const orderB = badgeOrder(b.path);
    if (orderB !== orderA) return orderB - orderA;
    return a.path.localeCompare(b.path);
  });
}

/** パス末尾から日本語ヒントを返す（例: .name → 名前） */
const PATH_HINT_MAP: Record<string, string> = {
  ".name": "名前",
  ".companyName": "会社名",
  ".company.name": "会社名",
  ".instrument.company.name": "メーカー",
  ".part.company.name": "部品メーカー",
  ".tagNumber": "タグ番号",
  ".controlNumber": "管理番号",
  ".createdAt": "作成日",
  ".reportTitle": "報告書タイトル",
  ".reportType": "報告種別",
  ".location": "設置場所",
  ".range": "レンジ",
  ".manufacturingDate": "製造日",
  ".overallAssessment": "総合評価",
  ".electrodeModel": "電極型式",
  ".detectorModel": "検出器型式",
  ".detectorManufacturingNumber": "検出器製造番号",
  ".equipmentName": "機器名",
  ".managementNumber": "管理番号",
  ".calAt": "校正日",
  ".calNumber": "校正番号",
  ".instrumentType": "種別",
  ".department": "部署",
  ".postalCode": "郵便番号",
  ".phone": "電話番号",
  ".fax": "FAX",
  ".email": "メールアドレス",
  ".partNumber": "部品番号",
  ".quantity": "数量",
  ".instrumentName": "計器名",
  ".modelNumber": "型式",
  ".serialNumber": "製造番号",
  ".inspectionDate": "検査日",
  ".result": "結果",
  ".value": "値",
  ".memo": "メモ",
  ".notes": "備考",
  ".roleKey": "役割キー",
  ".rows": "表の行（ループ用）",
};

export function getPathHint(path: string): string | null {
  const p = path;
  if (isOrderedPath(p)) return "Jinja2/JS の配列アクセス（1始まり）";
  const entries = Object.entries(PATH_HINT_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [suffix, hint] of entries) {
    if (p === suffix || p.endsWith(suffix)) return hint;
  }
  return null;
}
