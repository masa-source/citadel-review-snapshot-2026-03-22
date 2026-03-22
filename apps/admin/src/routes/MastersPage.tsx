import { Link } from "react-router-dom";
import {
  Database,
  ArrowLeft,
  Building2,
  Users,
  Wrench,
  Package,
  Gauge,
  MapPin,
  FileJson,
  Table2,
} from "lucide-react";

interface MasterCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
}

const MASTER_CARDS: MasterCard[] = [
  {
    title: "会社マスタ",
    description: "取引先・自社情報の管理",
    icon: <Building2 className="w-6 h-6" />,
    href: "/masters/companies",
  },
  {
    title: "作業者マスタ",
    description: "作業者・担当者の管理",
    icon: <Users className="w-6 h-6" />,
    href: "/masters/workers",
  },
  {
    title: "計器マスタ",
    description: "計器種別の管理",
    icon: <Wrench className="w-6 h-6" />,
    href: "/masters/instruments",
  },
  {
    title: "部品マスタ",
    description: "使用部品の管理",
    icon: <Package className="w-6 h-6" />,
    href: "/masters/parts",
  },
  {
    title: "所有計器マスタ",
    description: "会社所有の計器の管理",
    icon: <Gauge className="w-6 h-6" />,
    href: "/masters/owned-instruments",
  },
  {
    title: "現場マスタ",
    description: "現場・拠点の管理",
    icon: <MapPin className="w-6 h-6" />,
    href: "/masters/sites",
  },
  {
    title: "表定義マスタ",
    description: "表定義（列定義）の管理",
    icon: <Table2 className="w-6 h-6" />,
    href: "/masters/table-definitions",
  },
  {
    title: "スキーマ定義マスタ",
    description: "メタデータ駆動用スキーマの管理",
    icon: <FileJson className="w-6 h-6" />,
    href: "/masters/schema-definitions",
  },
];

export default function MastersPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16 min-h-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <Link to="/" className="flex-shrink-0 p-1 text-gray-600 hover:text-gray-900 -m-1">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="w-8 h-8 flex-shrink-0 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Database className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">マスタ管理</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Master Cards */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">マスタ一覧</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MASTER_CARDS.map((card) => (
              <Link
                key={card.title}
                to={card.href}
                className="block p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">{card.icon}</div>
                  <h3 className="font-semibold text-gray-900">{card.title}</h3>
                </div>
                <p className="text-sm text-gray-600">{card.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
