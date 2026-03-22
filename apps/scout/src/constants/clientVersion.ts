/**
 * フロントエンド（Scout）のバージョン。
 * ビルド時に Vite の define で VITE_SCOUT_VERSION に package.json の version が入る。
 * API が最小バージョンを要求している場合、古いクライアントは 426 を受け取り再読み込みを促される。
 */
export const CLIENT_VERSION =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SCOUT_VERSION) || "1.0.0";

/** 426 受信時に発火するカスタムイベント名 */
export const CLIENT_VERSION_REQUIRED_EVENT = "citadel:client-version-required";

export interface ClientVersionRequiredDetail {
  minVersion: string;
  message?: string;
}
