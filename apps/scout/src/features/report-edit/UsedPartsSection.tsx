import { UsedPartsForm } from "@/components/UsedPartsForm";
import { useReportEditState } from "./useReportEditState";

/**
 * 使用部品セクション。useReportEditState から effectiveId を取得し UsedPartsForm に渡す。
 */
export function UsedPartsSection(): React.ReactElement {
  const { effectiveId } = useReportEditState();
  const reportId = effectiveId && effectiveId !== "new" ? effectiveId : "";
  if (!reportId) return <></>;
  return (
    <section className="mt-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <UsedPartsForm reportId={reportId} />
    </section>
  );
}
