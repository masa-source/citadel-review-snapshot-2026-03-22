import { useCallback, useState } from "react";
import { isNetworkError } from "@citadel/monitoring";
import { useNetworkErrorStore } from "@/stores/networkErrorStore";

/**
 * 非同期処理 1 単位分のステート管理と例外処理を共通化する Hook。
 * - 実行中フラグ（isPending）
 * - 進捗（progress）
 * - 成功/エラーメッセージ（success / error）
 * - ネットワークエラー時の isNetworkError 判定と useNetworkErrorStore 連携
 *
 * 呼び出し側は execute に「やりたい処理だけ」を渡せばよく、try/catch/finally や
 * pending フラグの操作を毎回書かずに済む。
 *
 * 既存 Hook が持つ state をそのまま活かしたい場合は externalSetters を指定する。
 */
export interface AsyncTaskExternalSetters<TProgress> {
  setPending?: (value: boolean) => void;
  setProgress?: (value: TProgress | null) => void;
  setSuccess?: (value: string | null) => void;
  setError?: (value: string | null) => void;
}

export interface UseAsyncTaskOptions<TProgress> {
  /** 汎用エラー時のデフォルト文言（未指定なら Error.message を利用） */
  defaultErrorMessage?: string;
  /** ネットワークエラー時のデフォルト文言（未指定なら defaultErrorMessage を利用） */
  networkErrorMessage?: string;
  /** true のとき isNetworkError + useNetworkErrorStore を有効化 */
  enableNetworkStore?: boolean;
  /**
   * 既存 Hook が持つ state をそのまま活かしたい場合などに利用。
   * 内部 state と外部 setter の両方を更新する。
   */
  externalSetters?: AsyncTaskExternalSetters<TProgress>;
}

export interface ExecuteOptions {
  /** 呼び出しごとにデフォルトエラーメッセージを上書きしたい場合 */
  defaultErrorMessage?: string;
  /** 呼び出しごとにネットワークエラーメッセージを上書きしたい場合 */
  networkErrorMessage?: string;
}

export interface UseAsyncTaskResult<TProgress> {
  /** 実処理を渡して実行する。例: execute(async () => { ... }) */
  execute: <T>(task: () => Promise<T>, options?: ExecuteOptions) => Promise<T | undefined>;
  /** 実行中フラグ（外部 setter があっても内部的に保持） */
  isPending: boolean;
  /** 進捗値 */
  progress: TProgress | null;
  /** 成功メッセージ */
  success: string | null;
  /** エラーメッセージ */
  error: string | null;
  /** 呼び出し側から進捗を更新したい場合に使う setter */
  setProgress: (value: TProgress | null) => void;
  /** 成功メッセージを明示的に更新したい場合の setter */
  setSuccess: (value: string | null) => void;
  /** エラーメッセージを明示的に更新したい場合の setter */
  setError: (value: string | null) => void;
  /** 成功/エラー/進捗・pending を一括リセットする */
  reset: () => void;
}

export function useAsyncTask<TProgress = number>(
  options: UseAsyncTaskOptions<TProgress> = {}
): UseAsyncTaskResult<TProgress> {
  const {
    defaultErrorMessage,
    networkErrorMessage,
    enableNetworkStore = false,
    externalSetters,
  } = options;

  const [isPending, setIsPendingState] = useState(false);
  const [progress, setProgressState] = useState<TProgress | null>(null);
  const [success, setSuccessState] = useState<string | null>(null);
  const [error, setErrorState] = useState<string | null>(null);

  const setPending = useCallback(
    (value: boolean) => {
      setIsPendingState(value);
      externalSetters?.setPending?.(value);
    },
    [externalSetters]
  );

  const setProgress = useCallback(
    (value: TProgress | null) => {
      setProgressState(value);
      externalSetters?.setProgress?.(value);
    },
    [externalSetters]
  );

  const setSuccess = useCallback(
    (value: string | null) => {
      setSuccessState(value);
      externalSetters?.setSuccess?.(value);
    },
    [externalSetters]
  );

  const setError = useCallback(
    (value: string | null) => {
      setErrorState(value);
      externalSetters?.setError?.(value);
    },
    [externalSetters]
  );

  const reset = useCallback(() => {
    setPending(false);
    setProgress(null);
    setSuccess(null);
    setError(null);
  }, [setPending, setProgress, setSuccess, setError]);

  const execute = useCallback(
    async <T>(task: () => Promise<T>, execOptions?: ExecuteOptions): Promise<T | undefined> => {
      const mergedDefaultErrorMessage = execOptions?.defaultErrorMessage ?? defaultErrorMessage;
      const mergedNetworkErrorMessage =
        execOptions?.networkErrorMessage ?? networkErrorMessage ?? mergedDefaultErrorMessage;

      setSuccess(null);
      setError(null);
      setProgress(null);
      setPending(true);

      try {
        const result = await task();
        return result;
      } catch (e) {
        if (enableNetworkStore && isNetworkError(e)) {
          useNetworkErrorStore
            .getState()
            .setNetworkError(e instanceof Error ? e : new Error(String(e)));
          const message =
            mergedNetworkErrorMessage ??
            "サーバーに接続できませんでした。ネットワーク接続を確認してください。";
          setError(message);
        } else {
          const message =
            mergedDefaultErrorMessage ??
            (e instanceof Error ? e.message : "処理中にエラーが発生しました。");
          setError(message);
        }
        return undefined;
      } finally {
        setPending(false);
        setProgress(null);
      }
    },
    [
      defaultErrorMessage,
      networkErrorMessage,
      enableNetworkStore,
      setPending,
      setProgress,
      setSuccess,
      setError,
    ]
  );

  return {
    execute,
    isPending,
    progress,
    success,
    error,
    setProgress,
    setSuccess,
    setError,
    reset,
  };
}
