/**
 * useUpload の状態遷移テスト。
 * API エラー時に uploadError がセットされること、ネットワークエラー時は専用メッセージになることを検証。
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUpload } from "./useUpload";

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

const mockBuildUploadPayload = vi.fn();
const mockUploadWithChunkSession = vi.fn();
vi.mock("@/services/manage/uploadService", () => ({
  buildUploadPayload: (...args: unknown[]) => mockBuildUploadPayload(...args),
  buildUploadPayloadFromData: vi.fn(),
  uploadWithChunkSession: (...args: unknown[]) => mockUploadWithChunkSession(...args),
}));

describe("useUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildUploadPayload.mockResolvedValue({ reports: [] });
  });

  it("API がエラーを返した際に uploadError にメッセージがセットされる", async () => {
    mockUploadWithChunkSession.mockResolvedValueOnce({
      ok: false,
      errorMessage: "サーバー側で検証エラーが発生しました。",
    });

    const { result } = renderHook(() => useUpload());

    await act(async () => {
      result.current.handleUpload();
    });

    await waitFor(() => {
      expect(result.current.uploadError).toBe("サーバー側で検証エラーが発生しました。");
    });
    expect(result.current.isUploading).toBe(false);
  });

  it("ネットワークエラー時は uploadError にネットワーク用メッセージがセットされる", async () => {
    const networkError = new Error("Failed to fetch");
    mockUploadWithChunkSession.mockRejectedValueOnce(networkError);

    const { result } = renderHook(() => useUpload());

    await act(async () => {
      result.current.handleUpload();
    });

    await waitFor(() => {
      expect(result.current.uploadError).toBe(
        "サーバーに接続できませんでした。ネットワーク接続を確認してください。"
      );
    });
    expect(result.current.isUploading).toBe(false);
  });

  it("その他のエラー時は uploadError にエラーメッセージがセットされる", async () => {
    mockUploadWithChunkSession.mockRejectedValueOnce(
      new Error("アップロード中に例外が発生しました。")
    );

    const { result } = renderHook(() => useUpload());

    await act(async () => {
      result.current.handleUpload();
    });

    await waitFor(() => {
      expect(result.current.uploadError).toBe("アップロード中に例外が発生しました。");
    });
  });
});
