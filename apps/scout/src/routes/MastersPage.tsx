import { Link } from "react-router-dom";
import { Building2, Users, Gauge, Wrench, Package, MapPin } from "lucide-react";

export default function MastersPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex min-h-[44px] items-center rounded-lg px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            トップへ戻る
          </Link>
        </div>
        <h1 className="mb-6 text-xl font-bold text-gray-800 sm:text-2xl">マスタ管理</h1>
        <ul className="space-y-3">
          <li>
            <Link
              to="/masters/companies"
              className="flex min-h-[56px] items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-gray-50"
            >
              <Building2 className="h-6 w-6 shrink-0 text-gray-500" />
              <div className="flex-1 text-left">
                <span className="font-medium text-gray-800">会社マスタ</span>
                <p className="text-sm text-gray-500">会社・組織の登録・編集</p>
              </div>
            </Link>
          </li>
          <li>
            <Link
              to="/masters/workers"
              className="flex min-h-[56px] items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-gray-50"
            >
              <Users className="h-6 w-6 shrink-0 text-gray-500" />
              <div className="flex-1 text-left">
                <span className="font-medium text-gray-800">作業者マスタ</span>
                <p className="text-sm text-gray-500">作業者の登録・編集（会社と紐付け）</p>
              </div>
            </Link>
          </li>
          <li>
            <Link
              to="/masters/owned-instruments"
              className="flex min-h-[56px] items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-gray-50"
            >
              <Gauge className="h-6 w-6 shrink-0 text-gray-500" />
              <div className="flex-1 text-left">
                <span className="font-medium text-gray-800">所有計測器マスタ</span>
                <p className="text-sm text-gray-500">所有計測器の登録・編集</p>
              </div>
            </Link>
          </li>
          <li>
            <Link
              to="/masters/instruments"
              className="flex min-h-[56px] items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-gray-50"
            >
              <Wrench className="h-6 w-6 shrink-0 text-gray-500" />
              <div className="flex-1 text-left">
                <span className="font-medium text-gray-800">計器マスタ</span>
                <p className="text-sm text-gray-500">計器の登録・編集（会社と紐付け）</p>
              </div>
            </Link>
          </li>
          <li>
            <Link
              to="/masters/parts"
              className="flex min-h-[56px] items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-gray-50"
            >
              <Package className="h-6 w-6 shrink-0 text-gray-500" />
              <div className="flex-1 text-left">
                <span className="font-medium text-gray-800">部品マスタ</span>
                <p className="text-sm text-gray-500">部品の登録・編集（会社と紐付け）</p>
              </div>
            </Link>
          </li>
          <li>
            <Link
              to="/masters/sites"
              className="flex min-h-[56px] items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-gray-50"
            >
              <MapPin className="h-6 w-6 shrink-0 text-gray-500" />
              <div className="flex-1 text-left">
                <span className="font-medium text-gray-800">現場マスタ</span>
                <p className="text-sm text-gray-500">現場の登録・編集（名前・場所・説明・会社）</p>
              </div>
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
