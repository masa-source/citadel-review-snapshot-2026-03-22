import { useState } from "react";
import { Loader2, ScanSearch } from "lucide-react";
import { cn } from "@citadel/ui";
import { PlaceholderList } from "@/components/PlaceholderList";
import type { MatchStrategy } from "@/features/drafting/utils/placeholderMatching";

export interface ReportOption {
  id: string;
  reportTitle?: string | null;
}

export interface DraftingSidebarProps {
  reports: ReportOption[] | undefined;
  selectedReportId: string;
  onSelectedReportIdChange: (id: string) => void;
  contextData: unknown;
  contextLoading: boolean;
  treeFilterKeyword: string;
  onTreeFilterKeywordChange: (value: string) => void;
  onInsertPlaceholder: (placeholder: string) => void;
  onAutoMatchScan: (strategy: MatchStrategy) => void;
  insertFeedback: string | null;
  editMode: "internal" | "external";
  currentSheet: { name: string } | undefined;
  gridReady: boolean;
}

export function DraftingSidebar({
  reports,
  selectedReportId,
  onSelectedReportIdChange,
  contextData,
  contextLoading,
  treeFilterKeyword,
  onTreeFilterKeywordChange,
  onInsertPlaceholder,
  onAutoMatchScan,
  insertFeedback,
  editMode,
  currentSheet,
}: DraftingSidebarProps) {
  const [matchStrategy, setMatchStrategy] = useState<MatchStrategy>("ordered");

  return (
    <div className="flex flex-col min-h-0 border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200">
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 mb-2">
          <p className="text-xs text-amber-900">
            <strong>推奨:</strong> 同じセルに同じ人・同じ計器を出したい場合は、
            <code className="bg-amber-100 px-1 rounded text-[11px]">
              reportWorkersByWorkerId
            </code>{" "}
            や <code className="bg-amber-100 px-1 rounded text-[11px]">targetInstrumentsById</code>{" "}
            など<strong>キー参照</strong>を選ぶと、編集・同期後も安定して表示されます。
            <code className="bg-gray-100 px-1 rounded text-[11px]">reportWorkersOrdered[0]</code> や
            reportWorkerPrimary は「1件目」のため、並びが変わると別の人が表示されることがあります。
          </p>
        </div>
        <label className="text-sm font-medium text-gray-700 block mb-1">
          レポートを選んでプレースホルダを挿入
        </label>
        <select
          value={selectedReportId}
          onChange={(e) => onSelectedReportIdChange(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">-- レポートを選択 --</option>
          {reports?.map((r) => (
            <option key={r.id} value={r.id}>
              #{r.id} - {r.reportTitle || "(無題)"}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          左のツリーでセルを選択し、「挿入」でそのセルにプレースホルダを入れます。
        </p>
        <label className="text-xs font-medium text-gray-700 block mt-2 mb-1">マッチング戦略</label>
        <select
          value={matchStrategy}
          onChange={(e) => setMatchStrategy(e.target.value as MatchStrategy)}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
          aria-label="マッチング戦略"
        >
          <option value="ordered">汎用テンプレート用（連番を優先）</option>
          <option value="key">専用テンプレート用（キー・役割優先）</option>
          <option value="primary">単一データ用（1件目・Primary優先）</option>
        </select>
        <button
          type="button"
          onClick={() => onAutoMatchScan(matchStrategy)}
          disabled={editMode === "external" || !contextData || !currentSheet}
          className={cn(
            "mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
            editMode !== "external" && contextData && currentSheet
              ? "bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300"
              : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
          )}
        >
          <ScanSearch className="w-4 h-4 shrink-0" />
          自動マッチング（スキャン）
        </button>
        <p className="text-xs text-gray-500 mt-1">
          {editMode === "external"
            ? "自動マッチングは内部編集モードでのみ利用できます。"
            : "ツリーのセル値とレポートデータを照合し、一致したセルをプレースホルダに置換する提案を表示します。"}
        </p>
        {insertFeedback && (
          <p
            className={cn(
              "text-xs mt-2 px-2 py-1 rounded",
              insertFeedback.startsWith("挿入しました")
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            )}
          >
            {insertFeedback}
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3 min-h-0">
        {contextLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
          </div>
        ) : contextData ? (
          <PlaceholderList
            data={contextData}
            onInsert={onInsertPlaceholder}
            filterKeyword={treeFilterKeyword}
            onFilterChange={onTreeFilterKeywordChange}
          />
        ) : (
          <div className="text-center py-12 text-gray-500 text-sm">
            レポートを選択するとプレースホルダ一覧が表示されます。
          </div>
        )}
      </div>
    </div>
  );
}
