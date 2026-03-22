import { Link } from "react-router-dom";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-center text-xl font-semibold text-gray-800 sm:text-2xl">
        オフライン状態です
      </h1>
      <p className="max-w-md text-center text-gray-600">
        ネットワークに接続されていません。接続を確認してから再度お試しください。
      </p>
      <Link
        to="/"
        className="min-h-[44px] rounded-lg bg-blue-600 px-5 py-3 text-base font-medium text-white hover:bg-blue-700"
      >
        トップへ戻る
      </Link>
    </main>
  );
}
