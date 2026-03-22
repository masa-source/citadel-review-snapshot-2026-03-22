import { ReportOwnedInstrumentsForm } from "@/components/ReportOwnedInstrumentsForm";
import { useReportEditState } from "./useReportEditState";

/**
 * 報告書に紐づく保有機器セクション。useReportEditState から effectiveId を取得しフォームに渡す。
 */
export function ReportOwnedInstrumentsSection(): React.ReactElement {
  const { effectiveId } = useReportEditState();
  const reportId = effectiveId && effectiveId !== "new" ? effectiveId : "";
  if (!reportId) return <></>;
  return (
    <section className="mt-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <ReportOwnedInstrumentsForm reportId={reportId} />
    </section>
  );
}
