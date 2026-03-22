/**
 * TemplatesPage の UI 結合テスト（E2E・ローカル専用）。
 *
 * 役割: 「AIにおまかせ生成（Beta）」の UI フローが、実バックエンド・実 AI に到達して
 * 完了するかを検証する。本番に近い環境での手動確認用。
 *
 * 制約（このテストが成功する条件）:
 * - バックエンド (FastAPI) が http://localhost:8000 で起動していること
 * - Admin の VITE_API_URL がバックエンドを指していること（未設定時は localhost:8000）
 * - LM Studio 等の AI 用ローカルサーバが起動していること
 * - sample_complex_report.xlsx が backend の tests/fixtures に存在すること
 *
 * 注意: バックエンドまたは LM Studio が止まっていると、このテストは失敗する（エラー表示またはタイムアウト）。
 * CI では実行しない想定（local-only）。実際の AI 推論のため実行に時間がかかる。
 */

import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import fs from "fs";
import path from "path";

import TemplatesPage from "./TemplatesPage";

// sample_complex_report.xlsx のパス（admin から見た相対パス）
const FIXTURE_PATH = path.resolve(
  __dirname,
  "../../../../backend/tests/fixtures/sample_complex_report.xlsx"
);

describe("TemplatesPage E2E: AIにおまかせ生成（実バックエンド・LM Studio 必須・local-only）", () => {
  let file: File;

  beforeAll(() => {
    const buf = fs.readFileSync(FIXTURE_PATH);
    file = new File([buf], "sample_complex_report.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  });

  it("sample_complex_report.xlsx をアップロードして AI 自動生成フローが完走する", async () => {
    render(<TemplatesPage />);

    // ボタンが描画されるまで待機
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /AIにおまかせ生成/ })).toBeInTheDocument();
    });

    // ファイルと表示名をセット
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    // File オブジェクトを input に設定
    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });
    fireEvent.change(fileInput);

    fireEvent.change(screen.getByPlaceholderText("表紙①"), {
      target: { value: "AI自動生成E2Eテスト" },
    });

    const aiButton = screen.getByRole("button", { name: /AIにおまかせ生成/ });
    fireEvent.click(aiButton);

    // ローディング表示が出ること
    await waitFor(() => {
      expect(screen.getByText(/AIが分析してマスタとプレースホルダを構築中/)).toBeInTheDocument();
    });

    // バックエンド＋AI が完了するまで最大3分待つ（ローディングが消える＝handleAiGenerate の Promise が settle したとき）
    await waitFor(
      () => {
        expect(
          screen.queryByText(/AIが分析してマスタとプレースホルダを構築中/)
        ).not.toBeInTheDocument();
      },
      { timeout: 180_000 }
    );

    // 完了後、エラーが表示されていないこと（実機でバックエンド・LM Studio が動いていれば 200 で返りエラーなし）
    const error = screen.queryByText(/AI生成に失敗しました|AIの解析に失敗しました/);
    expect(error).toBeNull();
  }, 180_000);
});
