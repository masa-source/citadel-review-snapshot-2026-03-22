import { ScoutMasterPage } from "@/components/masters/ScoutMasterPage";
import {
  useDynamicScoutMasterConfig,
  type ScoutMasterEntity,
} from "@/components/masters/useScoutMasterConfig";

export function ScoutMasterPageClient({ entity }: { entity: string }) {
  const config = useDynamicScoutMasterConfig(entity as ScoutMasterEntity);
  return <ScoutMasterPage config={config} />;
}
