import { useCallback } from "react";
import type { DatabaseSchema } from "@citadel/types";
import { TABLE_KEYS } from "@citadel/types";
import { isDatabaseSchema, importWithIdRemapping, importWithOriginalIds } from "@/utils/dbImporter";
import { useAsyncTask } from "@/hooks/useAsyncTask";

export interface UseFileImportSetters {
  setImportError: (v: string | null) => void;
  setImportSuccess: (v: string | null) => void;
  setImportProgress: (v: string | null) => void;
  setIsImporting: (v: boolean) => void;
}

export interface UseFileImportOptions extends UseFileImportSetters {
  clearBeforeImport: boolean;
  importAsNew: boolean;
}

/**
 * JSON ファイルからの DB インポート実行。
 * 状態更新は呼び出し元の setter に委譲する。
 */
export function useFileImport({
  clearBeforeImport,
  importAsNew,
  setImportError,
  setImportSuccess,
  setImportProgress,
  setIsImporting,
}: UseFileImportOptions): (text: string) => Promise<void> {
  const task = useAsyncTask<string>({
    defaultErrorMessage: "インポート中にエラーが発生しました。",
    externalSetters: {
      setPending: setIsImporting,
      setProgress: setImportProgress,
      setSuccess: setImportSuccess,
      setError: setImportError,
    },
  });

  const processImport = useCallback(
    async (text: string) => {
      await task.execute(async () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch (e) {
          setImportError(
            `JSON のパースに失敗しました: ${e instanceof Error ? e.message : String(e)}`
          );
          return;
        }

        if (!isDatabaseSchema(parsed)) {
          setImportError(
            "JSON の形式が不正です。db.json と同じ構造（各キーが配列）である必要があります。"
          );
          return;
        }

        const data = parsed as DatabaseSchema;

        if (importAsNew) {
          await importWithIdRemapping(data, {
            clearBeforeImport,
            onProgress: (v) => task.setProgress(v),
          });
        } else {
          await importWithOriginalIds(data, {
            clearBeforeImport,
          });
        }

        const total = TABLE_KEYS.reduce((s, k) => s + (data[k]?.length ?? 0), 0);
        const modeLabel = importAsNew ? "（ID再採番）" : "";
        task.setSuccess(`${total} 件のレコードをインポートしました。${modeLabel}`);
      });
    },
    [clearBeforeImport, importAsNew, setImportError, task]
  );

  return processImport;
}
