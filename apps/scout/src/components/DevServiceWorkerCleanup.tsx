import { useEffect } from "react";

/**
 * 開発モードで Service Worker を登録解除するコンポーネント。
 * PWA を開発モードで無効にしても、以前に登録された SW が残る場合があるため、
 * このコンポーネントで明示的に登録解除する。
 */
export function DevServiceWorkerCleanup() {
  useEffect(() => {
    if (import.meta.env.DEV && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        if (registrations.length > 0) {
          console.log("[Dev] Service Worker を登録解除中...");
          registrations.forEach((registration) => {
            registration.unregister().then((success) => {
              if (success) {
                console.log("[Dev] Service Worker 登録解除完了");
              }
            });
          });
        }
      });
    }
  }, []);

  return null;
}
