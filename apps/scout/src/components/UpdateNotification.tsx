import { useState, useEffect, useCallback } from "react";
import { RefreshCw, X, WifiOff } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Alert, AlertTitle, AlertDescription, Button } from "@citadel/ui";

const OFFLINE_UNAVAILABLE_MESSAGE =
  "この接続環境ではオフライン機能が利用できません。HTTPS または localhost でお試しください。";

/**
 * PWA 更新通知バナー および オフライン機能不可バナー
 *
 * - 非セキュアコンテキスト（HTTP + IP 等）ではオフライン機能が利用できない旨を表示
 * - 新しいバージョンが利用可能な場合に更新を促す（vite-plugin-pwa useRegisterSW 利用）
 */
export function UpdateNotification() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("[SW] 登録エラー:", error);
    },
  });

  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  const isOfflineUnavailable =
    typeof window !== "undefined" && (!window.isSecureContext || !("serviceWorker" in navigator));

  const close = useCallback(() => {
    setNeedRefresh(false);
    setOfflineReady(false);
  }, [setNeedRefresh, setOfflineReady]);

  useEffect(() => {
    if (needRefresh) {
      const timer = setTimeout(() => setShowUpdateBanner(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [needRefresh]);

  // オフライン機能が利用できない場合のバナー（非セキュアコンテキスト等）
  if (isOfflineUnavailable && !offlineBannerDismissed) {
    return (
      <div className="pointer-events-none fixed bottom-20 left-4 right-4 z-40 md:bottom-4 md:left-auto md:right-4 md:w-96">
        <div className="pointer-events-auto">
          <Alert
            variant="default"
            className="border-amber-200 bg-amber-50 shadow-lg dark:border-amber-800 dark:bg-amber-950/30"
          >
            <WifiOff className="h-5 w-5 text-amber-600" />
            <AlertTitle>オフライン機能は利用できません</AlertTitle>
            <AlertDescription>
              <p className="mb-0 text-sm text-amber-800 dark:text-amber-200">
                {OFFLINE_UNAVAILABLE_MESSAGE}
              </p>
            </AlertDescription>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8"
              onClick={() => setOfflineBannerDismissed(true)}
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </Button>
          </Alert>
        </div>
      </div>
    );
  }

  // オフライン利用可能になった通知
  if (offlineReady) {
    return (
      <div className="pointer-events-none fixed bottom-20 left-4 right-4 z-40 md:bottom-4 md:left-auto md:right-4 md:w-96">
        <div className="pointer-events-auto">
          <Alert variant="default" className="shadow-lg">
            <AlertTitle>オフラインで利用可能になりました</AlertTitle>
            <AlertDescription>
              <p className="mb-2 text-sm">このアプリはオフラインで動作します。</p>
              <Button variant="outline" size="sm" onClick={close}>
                閉じる
              </Button>
            </AlertDescription>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8"
              onClick={close}
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </Button>
          </Alert>
        </div>
      </div>
    );
  }

  // 更新通知バナー
  if (!needRefresh || !showUpdateBanner) {
    return null;
  }

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  return (
    <div className="pointer-events-none fixed bottom-20 left-4 right-4 z-40 md:bottom-4 md:left-auto md:right-4 md:w-96">
      <div className="pointer-events-auto">
        <Alert variant="info" className="shadow-lg">
          <RefreshCw className="h-5 w-5" />
          <AlertTitle>新しいバージョンが利用可能です</AlertTitle>
          <AlertDescription>
            <p className="mb-3">アプリを更新して最新機能をご利用ください。</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleUpdate}>
                <RefreshCw className="h-4 w-4" />
                今すぐ更新
              </Button>
              <Button variant="outline" size="sm" onClick={close}>
                後で
              </Button>
            </div>
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-8 w-8"
            onClick={close}
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      </div>
    </div>
  );
}
