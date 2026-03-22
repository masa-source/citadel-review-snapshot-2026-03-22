/**
 * テンプレート管理ページのコンポーネントテスト
 * - ファイルアップロード時の状態遷移（バリデーション・送信中）
 * - 整合性スキャン（Sync）モーダルの表示ロジック
 * - AIおまかせ生成の正常系・異常系フロー（ローディング・API呼び出し・成功/エラー表示）
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import TemplatesPage from "./TemplatesPage";
import { notify } from "@/services/notify";

const mockMutate = vi.fn();
const mockAutoGenerateTemplate = vi.fn();

vi.mock("swr", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- モック用のシグネチャのため第2引数は未使用
  default: (key: string, _fetcher: () => Promise<unknown>) => {
    // テスト内で useSWR の戻り値を上書きするため、key に応じた fetcher はモックで扱う
    const data = key === "/api/templates" ? [] : key === "/api/report-formats" ? [] : undefined;
    return {
      data,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
    };
  },
}));

vi.mock("@/services/notify", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

const mockFetcher = vi.fn();
const mockApiPost = vi.fn();
const mockFetchTemplateScan = vi.fn().mockResolvedValue({
  inconsistent: false,
  newFiles: [],
  missingFromDisk: [],
});

vi.mock("@/utils/api", () => ({
  swrFetcher: (url: string) => mockFetcher(url),
  fetchTemplates: vi.fn().mockResolvedValue([]),
  fetchReportFormats: vi.fn().mockResolvedValue([]),
  fetchReportFormatTemplates: vi.fn().mockResolvedValue([]),
  fetchTemplateScan: (...args: unknown[]) => mockFetchTemplateScan(...args),
  unwrap: vi.fn((p: Promise<unknown>) => p),
  autoGenerateTemplate: (...args: unknown[]) => mockAutoGenerateTemplate(...args),
  apiClient: {
    POST: (...args: unknown[]) => mockApiPost(...args),
    GET: vi.fn(),
    DELETE: vi.fn(),
    PUT: vi.fn(),
  },
  getApiBaseUrl: vi.fn().mockReturnValue("http://localhost:8000"),
}));

describe("TemplatesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockResolvedValue(undefined);
    mockAutoGenerateTemplate.mockResolvedValue({
      template: { id: "t1", name: "AI Template", filePath: "templates/ai.xlsx" },
      report: { id: "r1", reportTitle: "Test Report" },
    });
    mockFetchTemplateScan.mockResolvedValue({
      inconsistent: false,
      newFiles: [],
      missingFromDisk: [],
    });
    // openapi-fetch の戻り値 shape に合わせる（destructure エラー防止）
    mockApiPost.mockResolvedValue({ data: undefined, error: undefined });
    mockFetcher.mockImplementation((url: string) => {
      if (url === "/api/templates" || url === "/api/report-formats") {
        return Promise.resolve([]);
      }
      if (url === "/api/templates/scan") {
        return mockFetchTemplateScan();
      }
      return Promise.resolve([]);
    });
    // localStorage: 挨拶を非表示にしておく
    Object.defineProperty(window, "localStorage", {
      value: { getItem: () => "true", setItem: vi.fn() },
      writable: true,
    });
  });

  describe("ファイルアップロード時の状態遷移", () => {
    it("ファイル未選択で送信すると「ファイルを選択してください。」が表示される", async () => {
      render(<TemplatesPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /ファイルを納品する/ })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole("button", { name: /ファイルを納品する/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("ファイルを選択してください。")).toBeInTheDocument();
      });
    });

    it("表示名未入力で送信すると「表示名を入力してください。」が表示される", async () => {
      render(<TemplatesPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /ファイルを納品する/ })).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      const file = new File(["x"], "test.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      fireEvent.change(fileInput, { target: { files: [file] } });

      const submitButton = screen.getByRole("button", { name: /ファイルを納品する/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("表示名を入力してください。")).toBeInTheDocument();
      });
    });

    it("送信開始時はボタンが「納品中...」となり無効化される", async () => {
      mockApiPost.mockImplementation(() => new Promise(() => {})); // 完了しない

      render(<TemplatesPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /ファイルを納品する/ })).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["x"], "test.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      fireEvent.change(fileInput, { target: { files: [file] } });

      fireEvent.change(screen.getByPlaceholderText("表紙①"), { target: { value: "表紙" } });

      const submitButton = screen.getByRole("button", { name: /ファイルを納品する/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /納品中/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /納品中/ })).toBeDisabled();
      });
    });
  });

  describe("整合性スキャン（Sync）モーダルの表示ロジック", () => {
    it("スキャン結果が不整合かつ新規ファイルありのとき「同期を開始」が有効で表示される", async () => {
      mockFetchTemplateScan.mockResolvedValueOnce({
        inconsistent: true,
        newFiles: ["template-local/new.xlsx"],
        missingFromDisk: [],
      });

      render(<TemplatesPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/template-local 内のファイルが変更されています/)
        ).toBeInTheDocument();
      });

      const syncButton = screen.getByRole("button", { name: /同期を開始/ });
      expect(syncButton).toBeEnabled();
    });

    it("不整合だが新規ファイルが0件のとき「同期を開始」は無効", async () => {
      mockFetchTemplateScan.mockResolvedValueOnce({
        inconsistent: true,
        newFiles: [],
        missingFromDisk: [{ id: "1", filePath: "missing.xlsx" }],
      });

      render(<TemplatesPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/template-local 内のファイルが変更されています/)
        ).toBeInTheDocument();
      });

      const syncButton = screen.getByRole("button", { name: /同期を開始/ });
      expect(syncButton).toBeDisabled();
    });

    it("「同期を開始」クリックで Sync モーダルが開く", async () => {
      mockFetchTemplateScan.mockResolvedValueOnce({
        inconsistent: true,
        newFiles: ["template-local/a.xlsx"],
        missingFromDisk: [],
      });
      mockApiPost.mockResolvedValue({});

      render(<TemplatesPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /同期を開始/ })).toBeEnabled();
      });

      fireEvent.click(screen.getByRole("button", { name: /同期を開始/ }));

      await waitFor(() => {
        const dialog = screen.getByRole("dialog", { name: undefined });
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText("テンプレート同期")).toBeInTheDocument();
      });
    });

    it("Sync モーダル内に進捗表示がある", async () => {
      mockFetchTemplateScan.mockResolvedValueOnce({
        inconsistent: true,
        newFiles: ["template-local/file.xlsx"],
        missingFromDisk: [],
      });
      // 同期 API は完了しない Promise にし、進捗表示がモーダルに出ることを確認
      mockApiPost.mockImplementation(() => new Promise(() => {}));

      render(<TemplatesPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /同期を開始/ })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole("button", { name: /同期を開始/ }));

      await waitFor(() => {
        const dialog = screen.getByRole("dialog", { name: undefined });
        expect(within(dialog).getByText(/現在 .* ファイル目を処理中/)).toBeInTheDocument();
      });
    });
  });

  describe("AIおまかせ生成（Beta）", () => {
    it("「AIにおまかせ生成（Beta）」ボタンが表示される", async () => {
      render(<TemplatesPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /AIにおまかせ生成/ })).toBeInTheDocument();
      });
    });

    it("AI生成ボタン押下でファイル未選択のとき「ファイルを選択してください。」が表示される", async () => {
      render(<TemplatesPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /AIにおまかせ生成/ })).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText("表紙①"), {
        target: { value: "AIテンプレート" },
      });
      fireEvent.click(screen.getByRole("button", { name: /AIにおまかせ生成/ }));

      await waitFor(() => {
        expect(screen.getByText("ファイルを選択してください。")).toBeInTheDocument();
      });
      expect(mockAutoGenerateTemplate).not.toHaveBeenCalled();
    });

    it("AI生成クリックでローディング表示され、成功時に mutate が呼ばれる", async () => {
      mockAutoGenerateTemplate.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  template: { id: "t1", name: "AI Template", filePath: "templates/ai.xlsx" },
                  report: { id: "r1", reportTitle: "Test Report" },
                }),
              50
            );
          })
      );

      render(<TemplatesPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /AIにおまかせ生成/ })).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["x"], "ai.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      fireEvent.change(fileInput, { target: { files: [file] } });
      fireEvent.change(screen.getByPlaceholderText("表紙①"), {
        target: { value: "AI自動生成テスト" },
      });

      const aiButton = screen.getByRole("button", { name: /AIにおまかせ生成/ });
      fireEvent.click(aiButton);

      // 検証1: クリック直後、ボタンが disabled かつローディングメッセージ表示（モックを遅延解決にして検証を安定させる）
      await waitFor(() => {
        expect(screen.getByText(/AIが分析してマスタとプレースホルダを構築中/)).toBeInTheDocument();
      });
      const loadingButton = screen.getByRole("button", { name: /AI生成中/ });
      expect(loadingButton).toBeDisabled();

      // 検証2: mockAutoGenerateTemplate が (file, "AI自動生成テスト") で 1 回呼ばれている
      expect(mockAutoGenerateTemplate).toHaveBeenCalledTimes(1);
      expect(mockAutoGenerateTemplate).toHaveBeenCalledWith(file, "AI自動生成テスト");

      // 検証3: 成功後、mutate と notify.success が呼ばれる
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled();
      });
      expect(notify.success).toHaveBeenCalledWith(
        "AIによるテンプレート構築とデータ登録が完了しました。"
      );
    });

    it("AIにおまかせ生成でAPIがエラーを返すと、ローディングが解除され画面上にエラーメッセージが表示される", async () => {
      mockAutoGenerateTemplate.mockRejectedValueOnce(new Error("AIの解析に失敗しました"));

      render(<TemplatesPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /AIにおまかせ生成/ })).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["x"], "error.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      fireEvent.change(fileInput, { target: { files: [file] } });
      fireEvent.change(screen.getByPlaceholderText("表紙①"), {
        target: { value: "エラーテスト" },
      });

      fireEvent.click(screen.getByRole("button", { name: /AIにおまかせ生成/ }));

      // 検証1・2: エラー表示が出現した後、ローディングが消えボタンが再度有効になっている
      await waitFor(() => {
        expect(screen.getByText("AIの解析に失敗しました")).toBeInTheDocument();
      });

      expect(
        screen.queryByText(/AIが分析してマスタとプレースホルダを構築中/)
      ).not.toBeInTheDocument();
      const aiButton = screen.getByRole("button", { name: /AIにおまかせ生成/ });
      expect(aiButton).not.toBeDisabled();
    });
  });
});
