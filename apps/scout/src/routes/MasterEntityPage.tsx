import { useParams, useNavigate } from "react-router-dom";
import { ScoutMasterPageClient } from "@/routes/masters/ScoutMasterPageClient";
import type { ScoutMasterEntity } from "@/components/masters/useScoutMasterConfig";

const validEntities: ScoutMasterEntity[] = [
  "companies",
  "workers",
  "sites",
  "instruments",
  "owned-instruments",
  "parts",
];

export function MasterEntityPage() {
  const { entity } = useParams<{ entity: string }>();
  const navigate = useNavigate();

  if (!entity || !validEntities.includes(entity as ScoutMasterEntity)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-600 font-medium">マスタが見つかりません</p>
          <button
            type="button"
            onClick={() => navigate("/masters", { replace: true })}
            className="mt-4 text-indigo-600 hover:underline"
          >
            マスタ一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  return <ScoutMasterPageClient entity={entity} />;
}
