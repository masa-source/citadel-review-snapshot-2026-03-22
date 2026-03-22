/**
 * レポート編集画面で使う型定義。
 */

import type { ReportFormValues as ReportFormValuesFromTypes } from "@citadel/types";

export type EditMode = "edit" | "view";

export type ViewMode = { type: "report" } | { type: "instrument"; instrumentId: string | "new" };

/** Zod の reportFormSchema から推論された型（@citadel/types で定義） */
export type ReportFormValues = ReportFormValuesFromTypes;

/** 担当者1行分（フォーム用）。roleKey はテンプレート用論理キー（leader, assistant 等） */
export type WorkerRow = {
  workerId: string;
  workerRole: string;
  roleKey: string;
};

/** 現場1行分（フォーム用）。roleKey はテンプレート用論理キー（main, sub 等） */
export type SiteRow = { siteId: string; roleKey: string };
