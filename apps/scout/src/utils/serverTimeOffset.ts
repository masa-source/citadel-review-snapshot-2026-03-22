/**
 * サーバー時刻とのオフセット（端末の Clock Drift 補正）。
 * 任務の有効期限はサーバー基準時刻で判定するため、同期・Handoff 等で
 * 取得した HTTP Date ヘッダからオフセットを計算して保持する。
 */

const STORAGE_KEY = "citadel_server_time_offset_ms";

/**
 * 現在保持しているオフセット（ミリ秒）を返す。
 * サーバー時刻 ≒ 端末時刻 + getServerTimeOffsetMs()
 * 未設定・不正値の場合は 0。
 */
export function getServerTimeOffsetMs(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * API 応答の Date ヘッダからオフセットを計算して保存する。
 * レスポンス受信直後に呼ぶこと（端末時刻は呼び出し時点の Date.now() を使用）。
 */
export function updateServerTimeOffsetFromResponse(response: Response): void {
  const dateHeader = response.headers.get("Date");
  if (!dateHeader || typeof window === "undefined") return;
  const serverTimeMs = new Date(dateHeader).getTime();
  if (Number.isNaN(serverTimeMs)) return;
  const clientTimeMs = Date.now();
  const offsetMs = serverTimeMs - clientTimeMs;
  localStorage.setItem(STORAGE_KEY, String(offsetMs));
}
