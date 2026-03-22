import { Suspense } from "react";
import { ReportEditFeature } from "@/features/report-edit";

export default function ReportEditPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
          <div className="mx-auto max-w-xl text-center text-gray-500">読み込み中...</div>
        </main>
      }
    >
      <ReportEditFeature />
    </Suspense>
  );
}
