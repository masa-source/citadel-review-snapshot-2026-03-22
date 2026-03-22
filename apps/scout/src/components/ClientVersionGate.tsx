import { useCallback, useEffect, useState } from "react";
import {
  CLIENT_VERSION_REQUIRED_EVENT,
  type ClientVersionRequiredDetail,
} from "@/constants/clientVersion";

/**
 * 426 Upgrade Required 受信時に表示するモーダル。
 * PWA のバージョンスキュー（古いフロントが新しい API を叩く）を防ぐため、
 * サーバーが最小バージョンを要求した場合は再読み込みを促す。
 */
export function ClientVersionGate(): React.ReactElement {
  const [detail, setDetail] = useState<ClientVersionRequiredDetail | null>(null);

  const handleEvent = useCallback((e: Event) => {
    const custom = e as CustomEvent<ClientVersionRequiredDetail>;
    setDetail(custom.detail ?? { minVersion: "" });
  }, []);

  useEffect(() => {
    window.addEventListener(CLIENT_VERSION_REQUIRED_EVENT, handleEvent);
    return () => window.removeEventListener(CLIENT_VERSION_REQUIRED_EVENT, handleEvent);
  }, [handleEvent]);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  if (!detail) return <></>;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
      role="alertdialog"
      aria-labelledby="client-version-title"
      aria-describedby="client-version-desc"
    >
      <div className="max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
        <h2
          id="client-version-title"
          className="text-lg font-semibold text-gray-900 dark:text-white"
        >
          アプリの更新が必要です
        </h2>
        <p id="client-version-desc" className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {detail.message ??
            "サーバーと互換性がありません。ページを再読み込みして新しいバージョンを読み込んでください。"}
        </p>
        {detail.minVersion && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            必要バージョン: {detail.minVersion}
          </p>
        )}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleReload}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:ring-offset-gray-900"
          >
            再読み込み
          </button>
        </div>
      </div>
    </div>
  );
}
