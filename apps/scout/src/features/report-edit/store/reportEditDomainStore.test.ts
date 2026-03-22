/**
 * reportEditDomainStore の状態遷移テスト（React 不使用、getState + アクション直接呼び出し）
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useReportEditDomainStore } from "./reportEditDomainStore";
import type { MissionStatusResult } from "@/hooks/useMissionStatus";

function getStore() {
  return useReportEditDomainStore.getState();
}

describe("reportEditDomainStore", () => {
  beforeEach(() => {
    useReportEditDomainStore.setState({
      missionStatus: null,
      editMode: "edit",
      effectiveEditMode: "edit",
      isReadOnly: false,
    });
  });

  it("setMissionStatus(null) で isReadOnly が true になる", () => {
    getStore().setMissionStatus(null);
    expect(getStore().missionStatus).toBeNull();
    expect(getStore().effectiveEditMode).toBe("view");
    expect(getStore().isReadOnly).toBe(true);
  });

  it("setMissionStatus({ canEdit: true }) で isReadOnly が false になる", () => {
    const status: MissionStatusResult = {
      hasMission: true,
      isExpired: false,
      canEdit: true,
      allowFinalExport: false,
      allowDataReset: false,
      mission: null,
      serverTimeOffsetMs: 0,
      deviceTimeIso: "",
      serverTimeIso: "",
    };
    getStore().setMissionStatus(status);
    expect(getStore().effectiveEditMode).toBe("edit");
    expect(getStore().isReadOnly).toBe(false);
  });

  it("setMissionStatus({ canEdit: false }) で isReadOnly が true になる", () => {
    const status: MissionStatusResult = {
      hasMission: true,
      isExpired: true,
      canEdit: false,
      allowFinalExport: false,
      allowDataReset: false,
      mission: null,
      serverTimeOffsetMs: 0,
      deviceTimeIso: "",
      serverTimeIso: "",
    };
    getStore().setMissionStatus(status);
    expect(getStore().effectiveEditMode).toBe("view");
    expect(getStore().isReadOnly).toBe(true);
  });

  it("canEdit: false のとき setEditMode('edit') しても effectiveEditMode は view のまま", () => {
    getStore().setMissionStatus({
      hasMission: true,
      isExpired: true,
      canEdit: false,
      allowFinalExport: false,
      allowDataReset: false,
      mission: null,
      serverTimeOffsetMs: 0,
      deviceTimeIso: "",
      serverTimeIso: "",
    });
    getStore().setEditMode("edit");
    expect(getStore().editMode).toBe("edit");
    expect(getStore().effectiveEditMode).toBe("view");
    expect(getStore().isReadOnly).toBe(true);
  });

  it("setViewMode / setOnline で対応する状態が更新される", () => {
    getStore().setViewMode({ type: "instrument", instrumentId: "inst-1" });
    expect(getStore().viewMode).toEqual({ type: "instrument", instrumentId: "inst-1" });
    getStore().setOnline(false);
    expect(getStore().isOnline).toBe(false);
  });
});
