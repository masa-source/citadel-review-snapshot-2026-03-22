import { useEffect, useState } from "react";

/**
 * オンライン/オフライン状態を監視するカスタムフック。
 *
 * ハイドレーションエラーを回避するため、初期状態は常に true（オンライン）として
 * サーバーサイドとクライアントサイドで一貫した値を返します。
 * クライアントサイドでマウント後に実際のオンライン状態を取得します。
 *
 * @returns {boolean} オンライン状態（true: オンライン, false: オフライン）
 */
export function useOnlineStatus(): boolean {
  // ハイドレーションエラーを回避しつつ、クライアントサイドでは即座に正しい状態を取得する
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
