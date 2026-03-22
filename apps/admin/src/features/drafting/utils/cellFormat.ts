/**
 * セル表示・プレースホルダ置換用の純粋関数。
 */

export const PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;

/** 0-based 列インデックスを Excel 風列ラベルに（1→A, 27→AA） */
export function getColumnLetter(index: number): string {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s || "A";
}

/** パス文字列をトークン化（.key / ['key'] / [1] を解釈）。Jinja2 と JS の両方で使える形式に対応。 */
function parsePathSegments(path: string): (string | number)[] {
  const segments: (string | number)[] = [];
  let s = path.trim();
  while (s.length > 0) {
    const dotWord = s.match(/^\.?(\w+)/);
    if (dotWord) {
      segments.push(dotWord[1]);
      s = s.slice(dotWord[0].length).trim();
      continue;
    }
    const singleQuoted = s.match(/^\['([^']*)'\]/);
    if (singleQuoted) {
      segments.push(singleQuoted[1].replace(/\\'/g, "'"));
      s = s.slice(singleQuoted[0].length).trim();
      continue;
    }
    const doubleQuoted = s.match(/^\["([^"]*)"\]/);
    if (doubleQuoted) {
      segments.push(doubleQuoted[1]);
      s = s.slice(doubleQuoted[0].length).trim();
      continue;
    }
    const numericIndex = s.match(/^\[(\d+)\]/);
    if (numericIndex) {
      segments.push(parseInt(numericIndex[1], 10));
      s = s.slice(numericIndex[0].length).trim();
      continue;
    }
    break;
  }
  return segments;
}

/** contextData から path（例: company.name, reportWorkersByWorkerId['uuid'].worker.name）で値を取得 */
export function resolvePath(obj: unknown, path: string): unknown {
  if (obj == null || !path.trim()) return undefined;
  const segments = parsePathSegments(path);
  let current: unknown = obj;
  for (const seg of segments) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const i = typeof seg === "number" ? seg : parseInt(String(seg), 10);
      if (Number.isNaN(i) || i < 0 || i >= current.length) return undefined;
      current = current[i];
    } else if (typeof current === "object") {
      const key = typeof seg === "number" ? String(seg) : seg;
      current = (current as Record<string, unknown>)[key];
    }
  }
  return current;
}

/** プレースホルダ用 path から末尾の .strftime('...') を除去し、解決用パスにする（JS プレビュー用フォールバック）。 */
export function pathForPreview(path: string): string {
  const trimmed = path.trim();
  return trimmed.replace(/\.strftime\s*\(\s*['"]([^'"]*)['"]\s*\)\s*$/, "");
}

/** セル値内の {{ path }} を contextData の実値に置換。見つからない場合は [未設定] */
export function replacePlaceholdersInCell(
  cell: string | number | null,
  context: unknown
): string | number | null {
  if (cell == null || typeof cell === "number") return cell;
  const str = String(cell);
  const replaced = str.replace(PLACEHOLDER_REGEX, (_, path: string) => {
    const pathToResolve = pathForPreview(path);
    const val = resolvePath(context, pathToResolve);
    if (val == null) return "[未設定]";
    return String(val);
  });
  return replaced;
}
