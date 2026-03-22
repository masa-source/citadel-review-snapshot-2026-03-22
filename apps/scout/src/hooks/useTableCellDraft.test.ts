import { describe, it, expect } from "vitest";
import {
  buildTableCellDraftKey,
  applyDraftToRows,
  type TableCellDraftKeyParams,
} from "./useTableCellDraft";

describe("useTableCellDraft (pure helpers)", () => {
  it("buildTableCellDraftKey が tableId/rowIndex/colKey から一意キーを作る", () => {
    const p: TableCellDraftKeyParams = { tableId: "t1", rowIndex: 2, colKey: "cA" };
    expect(buildTableCellDraftKey(p)).toBe("t1::2::cA");
  });

  it("applyDraftToRows が指定セルだけ更新した rows を返す", () => {
    const rows: Record<string, unknown>[] = [{ a: "0.05", b: "" }, { a: "6" }];
    const next = applyDraftToRows({
      rows,
      rowIndex: 0,
      colKey: "a",
      value: "0.056",
    });

    // immutable
    expect(next).not.toBe(rows);
    expect(next[0]).not.toBe(rows[0]);
    expect(next[1]).toBe(rows[1]);

    expect(String(next[0].a)).toBe("0.056");
    expect(String(next[1].a)).toBe("6");
  });

  it("applyDraftToRows は存在しない rowIndex の場合は元を返す", () => {
    const rows: Record<string, unknown>[] = [{ a: "x" }];
    const next = applyDraftToRows({ rows, rowIndex: 99, colKey: "a", value: "y" });
    expect(next).toBe(rows);
  });
});
