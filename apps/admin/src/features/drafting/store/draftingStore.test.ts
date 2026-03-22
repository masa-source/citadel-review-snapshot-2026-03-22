/**
 * draftingStore の状態遷移テスト（React 不使用、getState + アクション直接呼び出し）
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useDraftingStore } from "./draftingStore";

function getStore() {
  return useDraftingStore.getState();
}

describe("draftingStore", () => {
  beforeEach(() => {
    useDraftingStore.setState({
      pendingChanges: [],
      sheetName: "",
      mergeCells: undefined,
    });
  });

  it("setSheetContext で sheetName と mergeCells が更新される", () => {
    getStore().setSheetContext("Sheet1", []);
    expect(getStore().sheetName).toBe("Sheet1");
    expect(getStore().mergeCells).toEqual([]);

    getStore().setSheetContext("Sheet2", [{ row: 0, col: 0, rowspan: 2, colspan: 2 }]);
    expect(getStore().sheetName).toBe("Sheet2");
    expect(getStore().mergeCells).toHaveLength(1);
  });

  it("recordChange で pendingChanges に変更が追加される", () => {
    getStore().setSheetContext("S1", undefined);
    getStore().recordChange(0, 0, "value1");
    expect(getStore().pendingChanges).toHaveLength(1);
    expect(getStore().pendingChanges[0]).toMatchObject({
      sheetName: "S1",
      row: 0,
      col: 0,
      value: "value1",
    });

    getStore().recordChange(1, 2, 123);
    expect(getStore().pendingChanges).toHaveLength(2);
  });

  it("同一 sheet/row/col で recordChange すると既存が置き換わる", () => {
    getStore().setSheetContext("S1", undefined);
    getStore().recordChange(0, 0, "old");
    getStore().recordChange(0, 0, "new");
    expect(getStore().pendingChanges).toHaveLength(1);
    expect(getStore().pendingChanges[0].value).toBe("new");
  });

  it("clearPendingChanges で pendingChanges が空になる", () => {
    getStore().setSheetContext("S1", undefined);
    getStore().recordChange(0, 0, "v");
    getStore().clearPendingChanges();
    expect(getStore().pendingChanges).toEqual([]);
  });
});
