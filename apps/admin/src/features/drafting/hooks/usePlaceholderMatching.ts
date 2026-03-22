import { useState, useCallback, useEffect } from "react";
import useSWR from "swr";
import { apiClient, swrFetcher } from "@/utils/api";
import type { SheetData } from "@/features/drafting/types";
import type { ReportListItem } from "@citadel/types";
import type { MatchStrategy } from "@/features/drafting/utils/placeholderMatching";
import { useDraftingStore } from "@/features/drafting/store";

export interface UsePlaceholderMatchingArgs {
  editMode: "internal" | "external";
  currentSheet: SheetData | undefined;
}

export function usePlaceholderMatching({ editMode, currentSheet }: UsePlaceholderMatchingArgs) {
  const { data: reports } = useSWR<ReportListItem[]>("/api/reports", swrFetcher);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [contextData, setContextData] = useState<unknown>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const insertPlaceholder = useDraftingStore((s) => s.insertPlaceholder);
  const runMatchScan = useDraftingStore((s) => s.runMatchScan);
  const applyCheckedMatches = useDraftingStore((s) => s.applyCheckedMatches);
  const setInsertFeedback = useDraftingStore((s) => s.setInsertFeedback);

  const matchModalOpen = useDraftingStore((s) => s.matchModalOpen);
  const setMatchModalOpen = useDraftingStore((s) => s.setMatchModalOpen);
  const matchResults = useDraftingStore((s) => s.matchResults);
  const matchChecked = useDraftingStore((s) => s.matchChecked);
  const setMatchChecked = useDraftingStore((s) => s.setMatchChecked);
  const insertFeedback = useDraftingStore((s) => s.insertFeedback);

  const loadContext = useCallback(async (reportId: string) => {
    if (!reportId) {
      setContextData(null);
      return;
    }
    setContextLoading(true);
    try {
      const res = await apiClient.GET("/api/reports/{report_id}/context", {
        params: { path: { report_id: reportId } },
      });
      setContextData((res.data ?? null) as Record<string, unknown> | null);
    } catch {
      setContextData(null);
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedReportId) loadContext(selectedReportId);
    else setContextData(null);
  }, [selectedReportId, loadContext]);

  const handleInsertPlaceholder = useCallback(
    (placeholder: string) => {
      const result = insertPlaceholder(placeholder);
      if (result.success) {
        window.setTimeout(() => setInsertFeedback(null), 4000);
      }
    },
    [insertPlaceholder, setInsertFeedback]
  );

  const handleAutoMatchScan = useCallback(
    (strategy: MatchStrategy = "ordered") => {
      if (editMode === "external") return;
      if (!selectedReportId || !currentSheet) {
        setInsertFeedback("レポートを選択し、ツリーを表示した状態でスキャンしてください。");
        return;
      }
      void runMatchScan(selectedReportId, strategy);
    },
    [editMode, selectedReportId, currentSheet, runMatchScan, setInsertFeedback]
  );

  const handleApplyMatches = useCallback(() => {
    const count = applyCheckedMatches();
    if (count > 0) {
      window.setTimeout(() => setInsertFeedback(null), 4000);
    }
  }, [applyCheckedMatches, setInsertFeedback]);

  return {
    reports,
    selectedReportId,
    setSelectedReportId,
    contextData,
    contextLoading,
    matchModalOpen,
    setMatchModalOpen,
    matchResults,
    matchChecked,
    setMatchChecked,
    handleInsertPlaceholder,
    handleAutoMatchScan,
    handleApplyMatches,
    insertFeedback,
  };
}
