/**
 * useChildCollection — 配列操作の汎用フック
 *
 * 「reportId があれば IndexedDB サービスを呼び出し、
 *  なければ React State の配列を直接操作する」という
 * 共通パターンを一箇所に集約する。
 *
 * useReportForm.ts 内で ReportSite / ReportClient / ReportWorker ごとに
 * 重複していた swap / remove ロジックを置き換えるために使用する。
 */

import { useCallback } from "react";

export interface UseChildCollectionOptions<T> {
  /** 編集中のレポートID。空文字列の場合は新規作成モードとして State を操作する */
  reportId: string;
  /** State 更新関数（新規作成モード時に使用） */
  setRows: (updater: (prev: T[]) => T[]) => void;
  /**
   * DB の swap 関数（編集モード時に使用）
   * (reportId, index, direction) => Promise<void>
   */
  serviceSwap?: (reportId: string, index: number, direction: "up" | "down") => Promise<void>;
  /**
   * DB の delete 関数（編集モード時に使用）
   * (reportId, idOrIndex) => Promise<void>
   */
  serviceDelete?: (reportId: string, id: string) => Promise<void>;
}

export interface UseChildCollectionResult {
  /**
   * 指定した index の要素を up/down 方向に移動する。
   * - reportId あり: serviceSwap を呼び出す
   * - reportId なし: State の配列を入れ替える（範囲外の場合は何もしない）
   */
  swap: (index: number, direction: "up" | "down") => Promise<void>;
  /**
   * 指定した index（新規）または id（編集）の要素を除去する。
   * - reportId あり: serviceDelete を呼び出す（string として渡す）
   * - reportId なし: State から index でフィルタして除去する
   */
  remove: (idOrIndex: string | number) => Promise<void>;
}

export function useChildCollection<T>({
  reportId,
  setRows,
  serviceSwap,
  serviceDelete,
}: UseChildCollectionOptions<T>): UseChildCollectionResult {
  const swap = useCallback(
    async (index: number, direction: "up" | "down") => {
      if (reportId) {
        // 編集モード: DB サービスを呼び出す
        if (serviceSwap) {
          await serviceSwap(reportId, index, direction);
        }
      } else {
        // 新規作成モード: State の配列を直接入れ替える
        setRows((prev) => {
          const next = [...prev];
          const j = direction === "up" ? index - 1 : index + 1;
          if (j < 0 || j >= next.length) return prev; // 範囲外ガード
          [next[index], next[j]] = [next[j], next[index]];
          return next;
        });
      }
    },
    [reportId, setRows, serviceSwap]
  );

  const remove = useCallback(
    async (idOrIndex: string | number) => {
      if (reportId) {
        // 編集モード: DB サービスを呼び出す
        if (serviceDelete) {
          await serviceDelete(reportId, String(idOrIndex));
        }
      } else {
        // 新規作成モード: インデックスで State から除去
        setRows((prev) => prev.filter((_, i) => i !== idOrIndex));
      }
    },
    [reportId, setRows, serviceDelete]
  );

  return { swap, remove };
}
