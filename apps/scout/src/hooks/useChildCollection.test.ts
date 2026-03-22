/**
 * useChildCollection のユニットテスト
 *
 * テスト対象: apps/scout/src/hooks/useChildCollection.ts
 *
 * このフックは「reportId があれば DB サービスを呼び出し、
 * なければ State の配列を直接操作する」という共通パターンを汎用化する。
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChildCollection } from "./useChildCollection";

// ─── モック ──────────────────────────────────────────────────────────────────

/** 型チェック用のダミー行型 */
type Row = { id: string; label: string };

const mockServiceSwap = vi.fn();
const mockServiceDelete = vi.fn();

function makeOptions(reportId: string, rows: Row[]) {
  const setRows = vi.fn((updater: (prev: Row[]) => Row[]) => {
    rows = updater(rows);
  });
  return {
    reportId,
    setRows,
    serviceSwap: mockServiceSwap as (
      reportId: string,
      index: number,
      direction: "up" | "down"
    ) => Promise<void>,
    serviceDelete: mockServiceDelete as (reportId: string, id: string) => Promise<void>,
    _getRows: () => rows,
    _getSetRows: () => setRows,
  };
}

// ─── テスト ──────────────────────────────────────────────────────────────────

describe("useChildCollection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── swap（State 操作）──────────────────────────────────────────────────────

  describe("swap — reportId なし（State 操作）", () => {
    it("up 方向で index=1 の要素が index=0 と入れ替わる", async () => {
      const rows: Row[] = [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ];
      const opts = makeOptions("", rows);

      const { result } = renderHook(() =>
        useChildCollection({
          reportId: opts.reportId,
          setRows: opts.setRows,
          serviceSwap: opts.serviceSwap,
          serviceDelete: opts.serviceDelete,
        })
      );

      await act(async () => {
        await result.current.swap(1, "up");
      });

      const updatedRows = opts._getRows();
      expect(updatedRows[0].id).toBe("b");
      expect(updatedRows[1].id).toBe("a");
      expect(updatedRows[2].id).toBe("c");
    });

    it("down 方向で index=1 の要素が index=2 と入れ替わる", async () => {
      const rows: Row[] = [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ];
      const opts = makeOptions("", rows);

      const { result } = renderHook(() =>
        useChildCollection({
          reportId: opts.reportId,
          setRows: opts.setRows,
          serviceSwap: opts.serviceSwap,
          serviceDelete: opts.serviceDelete,
        })
      );

      await act(async () => {
        await result.current.swap(1, "down");
      });

      const updatedRows = opts._getRows();
      expect(updatedRows[0].id).toBe("a");
      expect(updatedRows[1].id).toBe("c");
      expect(updatedRows[2].id).toBe("b");
    });

    it("先頭要素（index=0）を up しても何も変わらない（範囲外ガード）", async () => {
      const rows: Row[] = [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ];
      const opts = makeOptions("", rows);

      const { result } = renderHook(() =>
        useChildCollection({
          reportId: opts.reportId,
          setRows: opts.setRows,
          serviceSwap: opts.serviceSwap,
          serviceDelete: opts.serviceDelete,
        })
      );

      await act(async () => {
        await result.current.swap(0, "up");
      });

      // setRows は呼ばれるが内部で prev を返すだけ → 順序不変
      const updatedRows = opts._getRows();
      expect(updatedRows[0].id).toBe("a");
      expect(updatedRows[1].id).toBe("b");
    });

    it("末尾要素（index=last）を down しても何も変わらない（範囲外ガード）", async () => {
      const rows: Row[] = [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ];
      const opts = makeOptions("", rows);

      const { result } = renderHook(() =>
        useChildCollection({
          reportId: opts.reportId,
          setRows: opts.setRows,
          serviceSwap: opts.serviceSwap,
          serviceDelete: opts.serviceDelete,
        })
      );

      await act(async () => {
        await result.current.swap(1, "down");
      });

      const updatedRows = opts._getRows();
      expect(updatedRows[0].id).toBe("a");
      expect(updatedRows[1].id).toBe("b");
    });
  });

  // ── swap（DB 操作）─────────────────────────────────────────────────────────

  describe("swap — reportId あり（DB 操作）", () => {
    it("serviceSwap を reportId・index・direction で呼び出す", async () => {
      const rows: Row[] = [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ];
      const opts = makeOptions("report-123", rows);
      mockServiceSwap.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() =>
        useChildCollection({
          reportId: opts.reportId,
          setRows: opts.setRows,
          serviceSwap: opts.serviceSwap,
          serviceDelete: opts.serviceDelete,
        })
      );

      await act(async () => {
        await result.current.swap(0, "down");
      });

      expect(mockServiceSwap).toHaveBeenCalledWith("report-123", 0, "down");
      // State は変更されないこと
      expect(opts._getSetRows()).not.toHaveBeenCalled();
    });
  });

  // ── remove（State 操作）────────────────────────────────────────────────────

  describe("remove — reportId なし（State 操作）", () => {
    it("指定インデックスの要素が除去される", async () => {
      const rows: Row[] = [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ];
      const opts = makeOptions("", rows);

      const { result } = renderHook(() =>
        useChildCollection({
          reportId: opts.reportId,
          setRows: opts.setRows,
          serviceSwap: opts.serviceSwap,
          serviceDelete: opts.serviceDelete,
        })
      );

      await act(async () => {
        await result.current.remove(1); // index=1 (b) を削除
      });

      const updatedRows = opts._getRows();
      expect(updatedRows).toHaveLength(2);
      expect(updatedRows[0].id).toBe("a");
      expect(updatedRows[1].id).toBe("c");
    });
  });

  // ── remove（DB 操作）───────────────────────────────────────────────────────

  describe("remove — reportId あり（DB 操作）", () => {
    it("serviceDelete を reportId・id で呼び出す", async () => {
      const rows: Row[] = [{ id: "a", label: "A" }];
      const opts = makeOptions("report-456", rows);
      mockServiceDelete.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() =>
        useChildCollection({
          reportId: opts.reportId,
          setRows: opts.setRows,
          serviceSwap: opts.serviceSwap,
          serviceDelete: opts.serviceDelete,
        })
      );

      await act(async () => {
        await result.current.remove("row-id-99");
      });

      expect(mockServiceDelete).toHaveBeenCalledWith("report-456", "row-id-99");
      // State は変更されないこと
      expect(opts._getSetRows()).not.toHaveBeenCalled();
    });
  });
});
