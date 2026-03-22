/**
 * useMissionStatus の単体テスト
 * - 任務なし（Handoff前）→ hasMission: false
 * - 任務あり・現在時刻 < expiresAt & permission=Edit → isExpired: false, canEdit: true
 * - 任務あり・現在時刻 > expiresAt（+猶予）→ isExpired: true, canEdit: false
 *
 * 時間の固定は vi.setSystemTime ではなく、フックに渡す nowMs 引数で行う。
 * （useFakeTimers を使うと useLiveQuery の非同期解決が止まり waitFor がタイムアウトするため）
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useMissionStatus, EXPIRY_GRACE_MS } from "./useMissionStatus";
import { db } from "@/db/db";
import type { MissionMeta } from "@citadel/types";

describe("useMissionStatus", () => {
  beforeEach(async () => {
    await db.missions.clear();
  });

  it("任務データがない場合（Handoff前）→ hasMission: false", async () => {
    const baseTime = new Date("2025-02-01T12:00:00Z").getTime();

    const { result } = renderHook(() => useMissionStatus(baseTime));

    await waitFor(
      () => {
        expect(result.current.hasMission).toBe(false);
        expect(result.current.mission).toBeNull();
      },
      { timeout: 3000 }
    );
  });

  it("任務があり、現在時刻が expiresAt 前の場合 → isExpired: false, canEdit: true (permission=Edit)", async () => {
    const baseTime = new Date("2025-02-01T12:00:00Z").getTime();
    const expiresAt = new Date("2025-02-01T14:00:00Z").toISOString(); // 2時間後

    await db.missions.add({
      missionId: "mission-1",
      permission: "Edit",
      issuedAt: new Date("2025-02-01T10:00:00Z").toISOString(),
      expiresAt,
    });

    const { result } = renderHook(() => useMissionStatus(baseTime));

    await waitFor(
      () => {
        expect(result.current.hasMission).toBe(true);
        expect(result.current.isExpired).toBe(false);
        expect(result.current.canEdit).toBe(true);
        expect(result.current.mission?.permission).toBe("Edit");
        expect(result.current.mission?.expiresAt).toBe(expiresAt);
      },
      { timeout: 3000 }
    );
  });

  it("任務があり、permission=Collect の場合 → canEdit: true（データ採集・新規作成可）", async () => {
    const baseTime = new Date("2025-02-01T12:00:00Z").getTime();
    const expiresAt = new Date("2025-02-01T14:00:00Z").toISOString();

    await db.missions.add({
      missionId: "mission-collect",
      permission: "Collect",
      issuedAt: new Date("2025-02-01T10:00:00Z").toISOString(),
      expiresAt,
    } as MissionMeta);

    const { result } = renderHook(() => useMissionStatus(baseTime));

    await waitFor(
      () => {
        expect(result.current.hasMission).toBe(true);
        expect(result.current.canEdit).toBe(true);
        expect(result.current.mission?.permission).toBe("Collect");
      },
      { timeout: 3000 }
    );
  });

  it("任務があり、permission=View の場合 → canEdit: false（閲覧のみ）", async () => {
    const baseTime = new Date("2025-02-01T12:00:00Z").getTime();
    const expiresAt = new Date("2025-02-01T14:00:00Z").toISOString();

    await db.missions.add({
      missionId: "mission-view",
      permission: "View",
      issuedAt: new Date("2025-02-01T10:00:00Z").toISOString(),
      expiresAt,
    });

    const { result } = renderHook(() => useMissionStatus(baseTime));

    await waitFor(
      () => {
        expect(result.current.hasMission).toBe(true);
        expect(result.current.canEdit).toBe(false);
        expect(result.current.mission?.permission).toBe("View");
      },
      { timeout: 3000 }
    );
  });

  it("任務があり、現在時刻が expiresAt を過ぎている場合 → isExpired: true, canEdit: false", async () => {
    const expiresAt = new Date("2025-02-01T12:00:00Z");
    const expiresAtMs = expiresAt.getTime();
    // 現在時刻を expiresAt + 猶予 以降に設定（nowMs で固定）
    const nowMs = expiresAtMs + EXPIRY_GRACE_MS + 60_000;

    await db.missions.add({
      missionId: "mission-2",
      permission: "Edit",
      issuedAt: new Date("2025-02-01T10:00:00Z").toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    const { result } = renderHook(() => useMissionStatus(nowMs));

    await waitFor(
      () => {
        expect(result.current.hasMission).toBe(true);
        expect(result.current.isExpired).toBe(true);
        expect(result.current.canEdit).toBe(false);
        expect(result.current.allowFinalExport).toBe(true);
        expect(result.current.allowDataReset).toBe(true);
      },
      { timeout: 3000 }
    );
  });
});
