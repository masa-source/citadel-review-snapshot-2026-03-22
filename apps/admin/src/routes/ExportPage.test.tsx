/**
 * エクスポートページのコンポーネントテスト
 * - Scoutを起動して転送: handoff API が camelCase の ticketId を返すことを前提に成功する
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ExportPage from "./ExportPage";

const mockFetcher = vi.fn();
const mockApiPost = vi.fn();
const mockGetScoutBaseUrl = vi.fn();

vi.mock("swr", () => ({
  default: (key: string) => {
    return {
      data: key === "/api/reports" ? [] : key.startsWith("/api/missions") ? [] : undefined,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    };
  },
}));

vi.mock("@/utils/api", () => ({
  swrFetcher: (url: string) => mockFetcher(url),
  fetchReports: vi.fn().mockResolvedValue([]),
  fetchMissions: vi.fn().mockResolvedValue([]),
  getScoutBaseUrl: () => mockGetScoutBaseUrl(),
  apiClient: {
    POST: (...args: unknown[]) => mockApiPost(...args),
    GET: vi.fn(),
    DELETE: vi.fn(),
    PUT: vi.fn(),
  },
}));

describe("ExportPage", () => {
  let mockOpen: ReturnType<typeof vi.fn>;
  let fakeWindow: {
    document: { write: ReturnType<typeof vi.fn> };
    location: { href: string };
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScoutBaseUrl.mockReturnValue("https://scout.example");
    fakeWindow = {
      document: { write: vi.fn() },
      location: { href: "" },
      close: vi.fn(),
    };
    mockOpen = vi.fn(() => fakeWindow);
    Object.defineProperty(globalThis.window, "open", { value: mockOpen, writable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals?.();
  });

  describe("Scoutを起動して転送", () => {
    it("handoff API が camelCase の ticketId を返すと成功し、新しいウィンドウにチケット付き URL を開く", async () => {
      mockApiPost.mockResolvedValue({
        data: { ok: true, ticketId: "test-ticket-uuid-123" },
        error: undefined,
        response: { status: 200 },
      });

      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Scoutを起動して転送/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Scoutを起動して転送/ }));

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith(
          "/api/sync/handoff",
          expect.objectContaining({ body: expect.any(Object) })
        );
      });

      expect(fakeWindow.location.href).toContain("ticket=test-ticket-uuid-123");
      expect(fakeWindow.location.href).toMatch(/^https:\/\/scout\.example\/manage\?/);
      await waitFor(() => {
        expect(screen.getByText(/Scoutを起動しました/)).toBeInTheDocument();
      });
    });

    it("handoff API が ticketId を返さないとエラーメッセージを表示する", async () => {
      mockApiPost.mockResolvedValue({
        data: { ok: true },
        error: undefined,
        response: { status: 200 },
      });

      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Scoutを起動して転送/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Scoutを起動して転送/ }));

      await waitFor(() => {
        expect(
          screen.getByText(/Scoutの起動に失敗しました|チケットIDの取得に失敗しました/)
        ).toBeInTheDocument();
      });
      expect(fakeWindow.close).toHaveBeenCalled();
    });
  });
});
