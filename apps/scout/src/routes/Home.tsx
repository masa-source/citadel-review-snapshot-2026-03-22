import { Link } from "react-router-dom";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold text-center">次世代現場報告システム (Offline Mode)</h1>
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Link
          to="/reports"
          className="min-h-[44px] rounded-lg bg-blue-600 px-5 py-3 text-base font-medium text-white hover:bg-blue-700"
        >
          レポート一覧
        </Link>
        <Link
          to="/masters"
          className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-5 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"
        >
          マスタ管理
        </Link>
        <Link
          to="/manage"
          className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-5 py-3 text-base font-medium text-gray-700 hover:bg-gray-100"
        >
          データ管理
        </Link>
      </div>
    </main>
  );
}
