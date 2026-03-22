/**
 * useSyncDownload の状態遷移テスト。
 * API エラー時に deltaSyncError がセットされること、ネットワークエラー時は専用メッセージになることを検証。
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSyncDownload } from "./useSyncDownload";

vi.mock("@/hooks/useSyncWorker", () => ({
  useSyncWorker: () => ({
    isReady: false,
    runCommand: vi.fn(),
  }),
}));

vi.mock("@/stores/networkErrorStore", () => ({
  useNetworkErrorStore: {
    getState: () => ({ setNetworkError: vi.fn() }),
  },
}));

const mockFetchDelta = vi.fn();
const mockFetchAndMergeDeltaStream = vi.fn();
vi.mock("@/services/manage/syncService", () => ({
  fetchDelta: (...args: unknown[]) => mockFetchDelta(...args),
  fetchFull: vi.fn(),
  fetchAndMergeDeltaStream: (...args: unknown[]) => mockFetchAndMergeDeltaStream(...args),
  fetchAndMergeFullStream: vi.fn(),
  isNetworkError: (e: unknown) =>
    e instanceof Error &&
    (e.message.includes("Failed to fetch") || e.message.includes("NetworkError")),
}));

describe("useSyncDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAndMergeDeltaStream.mockRejectedValue(new Error("not used in test"));
  });

  it("API がエラーを返した際に deltaSyncError にメッセージがセットされる", async () => {
    mockFetchAndMergeDeltaStream.mockRejectedValueOnce(new Error("差分同期に失敗しました。"));

    const { result } = renderHook(() => useSyncDownload());

    await act(async () => {
      result.current.handleDeltaSync(false);
    });

    await waitFor(() => {
      expect(result.current.deltaSyncError).toBe("差分同期に失敗しました。");
    });
    expect(result.current.isDeltaSyncing).toBe(false);
  });

  it("ネットワークエラー時は deltaSyncError にネットワーク用メッセージがセットされる", async () => {
    mockFetchAndMergeDeltaStream.mockRejectedValueOnce(new Error("Failed to fetch"));

    const { result } = renderHook(() => useSyncDownload());

    await act(async () => {
      result.current.handleDeltaSync(false);
    });

    await waitFor(() => {
      expect(result.current.deltaSyncError).toBe(
        "サーバーに接続できませんでした。ネットワーク接続を確認してください。"
      );
    });
    expect(result.current.isDeltaSyncing).toBe(false);
  });
});
