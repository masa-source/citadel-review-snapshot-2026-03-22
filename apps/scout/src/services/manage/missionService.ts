/**
 * 任務（Mission）関連のサービス層。
 * Heartbeat 送信などの API 通信を集約する。
 */

import { getApiBaseUrl, getDefaultHeaders } from "@/utils/apiClient";
import type { ErrorCode } from "@citadel/types";
import { ErrorCodes } from "@citadel/types";

/**
 * 任務 Heartbeat をサーバーへ送信する。
 * 403 かつ PURGED コードの場合は "purged" フラグが true の結果を返す。
 * 通信エラーは握り潰す（Heartbeat は失敗しても致命的でない）。
 */
export async function sendMissionHeartbeat(
  missionId: string,
  deviceId: string
): Promise<{ purged: boolean }> {
  try {
    const url = `${getApiBaseUrl()}/api/missions/${encodeURIComponent(missionId)}/heartbeat`;
    const res = await fetch(url, {
      method: "POST",
      headers: getDefaultHeaders(),
      body: JSON.stringify({ deviceId }),
    });
    if (res.status === 403) {
      let errBody: unknown = null;
      try {
        errBody = await res.json();
      } catch {
        // ignore
      }
      if (
        errBody &&
        typeof errBody === "object" &&
        "code" in errBody &&
        (errBody as { code?: ErrorCode }).code === ErrorCodes.PURGED
      ) {
        return { purged: true };
      }
    }
    return { purged: false };
  } catch {
    // Heartbeat は失敗しても致命的でないため無視
    return { purged: false };
  }
}
