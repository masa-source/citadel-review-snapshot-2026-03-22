/**
 * useHandoff の状態遷移テスト。
 * runHandoff がエラーを返した際に setImportError に適切なメッセージが設定されることを検証。
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useHandoff } from "./useHandoff";

const mockRunHandoff = vi.fn();
vi.mock("@/services/manage/handoffService", () => ({
  runHandoff: (...args: unknown[]) => mockRunHandoff(...args),
  normalizeHandoffError: (e: unknown) => {
    if (e instanceof Error) {
      if (e.message.includes("Failed to fetch"))
        return {
          errorMessage:
            "バックエンドへの接続に失敗しました。他PCやIPアドレスでScoutを開いている場合は、バックエンドの ALLOWED_ORIGINS に Scout のオリジン（例: http://サーバのIP:3000）を追加し、バックエンドを再起動してください。詳細は docs/HANDOFF_TROUBLESHOOTING.md を参照してください。",
        };
      return { errorMessage: e.message };
    }
    return { errorMessage: "Direct Handoffに失敗しました。" };
  },
}));

function createMockSearchParams(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams(overrides);
}

describe("useHandoff", () => {
  let setImportError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setImportError = vi.fn();
  });

  it("runHandoff がエラーを throw した際に setImportError にメッセージが設定される", async () => {
    mockRunHandoff.mockRejectedValueOnce(new Error("ネットワークエラー"));

    const searchParams = createMockSearchParams();
    const { result } = renderHook(() =>
      useHandoff({
        searchParams,
        isOnline: true,
        setHandoffStatus: vi.fn(),
        setImportProgress: vi.fn(),
        setImportSuccess: vi.fn(),
        setImportError,
        setIsImporting: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.processHandoff("ticket-1", false);
    });

    await waitFor(() => {
      expect(setImportError).toHaveBeenCalledWith("ネットワークエラー");
    });
  });

  it("runHandoff がネットワークエラーを throw した際に setImportError に接続失敗メッセージが設定される", async () => {
    mockRunHandoff.mockRejectedValueOnce(new Error("Failed to fetch"));

    const searchParams = createMockSearchParams();
    const { result } = renderHook(() =>
      useHandoff({
        searchParams,
        isOnline: true,
        setHandoffStatus: vi.fn(),
        setImportProgress: vi.fn(),
        setImportSuccess: vi.fn(),
        setImportError,
        setIsImporting: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.processHandoff("ticket-2", false);
    });

    await waitFor(() => {
      expect(setImportError).toHaveBeenCalledWith(
        expect.stringContaining("バックエンドへの接続に失敗しました")
      );
    });
  });

  it("runHandoff が ok: false を返した際に setImportError に errorMessage が設定される", async () => {
    mockRunHandoff.mockResolvedValueOnce({
      ok: false,
      errorMessage: "データが見つかりませんでした。",
    });

    const searchParams = createMockSearchParams();
    const { result } = renderHook(() =>
      useHandoff({
        searchParams,
        isOnline: true,
        setHandoffStatus: vi.fn(),
        setImportProgress: vi.fn(),
        setImportSuccess: vi.fn(),
        setImportError,
        setIsImporting: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.processHandoff("ticket-3", false);
    });

    await waitFor(() => {
      expect(setImportError).toHaveBeenCalledWith("データが見つかりませんでした。");
    });
  });
});
