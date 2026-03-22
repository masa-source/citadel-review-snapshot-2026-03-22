/**
 * 任務の寿命を監視し、任務終了モードかどうかを返す。
 * オフライン駆動: 自身の expiresAt のみを基準に動作する。
 * 有効期限判定は「サーバー基準時刻」で行う（端末の Clock Drift をオフセットで補正）。
 *
 * 任務権限:
 * - Collect（データ採集）: デフォルト。レポートが0件でも新規作成可能。既存レポートの閲覧・編集も可。
 * - Edit（編集）: 既存レポートの編集・新規作成が可能。レポートが0件でも1件目を新規作成できる。
 * - View（閲覧）: 既存レポートの閲覧のみ。新規作成・編集は不可。レポートが0件のときは閲覧対象なし。
 */

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useSyncExternalStore } from "react";
import { db } from "@/db/db";
import { getServerTimeOffsetMs } from "@/utils/serverTimeOffset";

const POLL_INTERVAL_MS = 2000;

/** 期限切れ判定の猶予（ミリ秒）。サーバーと端末の時刻ズレ（数分）を吸収する。 */
export const EXPIRY_GRACE_MS = 5 * 60 * 1000;

type TickSnapshot = { tick: number; offsetMs: number };

// useSyncExternalStore では getSnapshot が同一レンダー中で同じ値を返す必要がある。
// 毎回 Date.now() を返すと「ストアが変わった」と判断されて再レンダーが続くため、
// インターバルでだけ更新する。オフセットもここで再読しサーバー基準時刻の更新を反映する。
let cachedSnapshot: TickSnapshot = {
  tick: Date.now(),
  offsetMs: 0,
};
function subscribeToTick(callback: () => void) {
  const id = setInterval(() => {
    cachedSnapshot = {
      tick: Date.now(),
      offsetMs: getServerTimeOffsetMs(),
    };
    callback();
  }, POLL_INTERVAL_MS);
  return () => clearInterval(id);
}
function getTickSnapshot(): TickSnapshot {
  return cachedSnapshot;
}
function getTickServerSnapshot(): TickSnapshot {
  return cachedSnapshot;
}

export interface MissionStatusResult {
  /** 任務メタデータが存在するか（Handoff で受領済みか） */
  hasMission: boolean;
  /** 現在時刻が expiresAt を超えている（任務終了モード）。判定はサーバー基準時刻で実施。 */
  isExpired: boolean;
  /** 編集・新規作成可能か（任務あり & 未期限切れ & permission が Collect または Edit） */
  canEdit: boolean;
  /** 退避データの生成を許可するか（任務終了モードまたは利用停止時） */
  allowFinalExport: boolean;
  /** 端末データの初期化（DB 全クリア）を許可するか */
  allowDataReset: boolean;
  /** 任務メタデータ（表示用） */
  mission: {
    missionId: string;
    permission: "View" | "Edit" | "Collect" | "Copy";
    expiresAt: string;
    issuedAt: string;
  } | null;
  /** 診断用: サーバー時刻オフセット（ms）。端末時刻 + この値 ≒ サーバー基準時刻。 */
  serverTimeOffsetMs: number;
  /** 診断用: 端末の現在時刻（ISO）。「保存できない」時の原因切り分けに利用。 */
  deviceTimeIso: string;
  /** 診断用: サーバー基準の現在時刻（ISO）。有効期限判定に使用している時刻。 */
  serverTimeIso: string;
}

function getMissionStatus(
  mission: { permission?: string; expiresAt?: string } | null | undefined,
  nowMs: number
): MissionStatusResult {
  if (!mission || !mission.expiresAt) {
    return {
      hasMission: false,
      isExpired: false,
      canEdit: true,
      allowFinalExport: false,
      allowDataReset: false,
      mission: null,
      serverTimeOffsetMs: 0,
      deviceTimeIso: "",
      serverTimeIso: "",
    };
  }
  const expiresAtMs = new Date(mission.expiresAt).getTime();
  const isExpired = nowMs >= expiresAtMs + EXPIRY_GRACE_MS;
  const permission = (mission.permission ?? "Collect").trim();
  // Collect（データ採集）・Edit（編集）・Copy（コピー）なら新規作成・編集可。View（閲覧）は閲覧のみ。
  const canEdit =
    !isExpired && (permission === "Collect" || permission === "Edit" || permission === "Copy");
  const normalizedPermission: "View" | "Edit" | "Collect" | "Copy" = [
    "Collect",
    "Edit",
    "View",
    "Copy",
  ].includes(permission)
    ? (permission as "View" | "Edit" | "Collect" | "Copy")
    : "View";
  return {
    hasMission: true,
    isExpired,
    canEdit,
    allowFinalExport: isExpired,
    allowDataReset: isExpired,
    mission: {
      missionId: (mission as { missionId?: string }).missionId ?? "",
      permission: normalizedPermission,
      expiresAt: mission.expiresAt,
      issuedAt: (mission as { issuedAt?: string }).issuedAt ?? "",
    },
    serverTimeOffsetMs: 0,
    deviceTimeIso: "",
    serverTimeIso: "",
  };
}

/**
 * 現在の任務状態を取得。IndexedDB の missions テーブルから 1 件取得し、
 * expiresAt とサーバー基準現在時刻を比較して任務終了モードかどうかを返す。
 * サーバー基準時刻 = 端末時刻 + オフセット（同期・Handoff 時の HTTP Date から算出）。
 */
export function useMissionStatus(nowMs?: number): MissionStatusResult {
  const snapshot = useSyncExternalStore(subscribeToTick, getTickSnapshot, getTickServerSnapshot);
  const effectiveNow = nowMs ?? snapshot.tick + snapshot.offsetMs;

  const mission = useLiveQuery(async () => {
    try {
      const table = db.missions;
      if (!table) {
        return null;
      }
      const list = await table.toArray();
      const first = list[0] ?? null;
      if (first) {
        console.log("[MissionStatus] missions 読み込み:", {
          missionId: (first as { missionId?: string }).missionId,
          permission: first.permission,
          expiresAt: first.expiresAt,
          count: list.length,
        });
      } else {
        console.log("[MissionStatus] missions 0件");
      }
      return first;
    } catch (e) {
      console.error("[MissionStatus] missions 読み込みエラー:", e);
      return null;
    }
  }, []);

  return useMemo(() => {
    const m = mission === undefined ? null : (mission ?? null);
    const base = getMissionStatus(m, effectiveNow);
    return {
      ...base,
      serverTimeOffsetMs: snapshot.offsetMs,
      deviceTimeIso: new Date(snapshot.tick).toISOString(),
      serverTimeIso: new Date(effectiveNow).toISOString(),
    };
  }, [mission, effectiveNow, snapshot.tick, snapshot.offsetMs]);
}
