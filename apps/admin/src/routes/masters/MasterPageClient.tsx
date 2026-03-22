import { MasterPage } from "@/components/masters/MasterPage";
import {
  useDynamicMasterConfig,
  type AdminMasterEntity,
} from "@/components/masters/useMasterConfig";

export function MasterPageClient({ entity }: { entity: string }) {
  const config = useDynamicMasterConfig(entity as AdminMasterEntity);
  return <MasterPage config={config} />;
}
