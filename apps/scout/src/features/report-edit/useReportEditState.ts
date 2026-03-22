import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { getRepository } from "@/services/data";
import type { Report } from "@citadel/types";
import { useMissionStatus } from "@/hooks/useMissionStatus";
import { useReportEditDomainStore } from "./store";
import type { EditMode } from "./types";

export function useReportEditState() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const paramsId = searchParams.get("id");
  const paramsMode = searchParams.get("mode") as EditMode | null;
  const missionStatus = useMissionStatus();

  const [currentId, setCurrentId] = useState<string | null>(null);
  const justSavedNewRef = useRef(false);

  const { setMissionStatus, setEditMode, editMode, isReadOnly, viewMode, setViewMode } =
    useReportEditDomainStore();

  useEffect(() => {
    setMissionStatus(missionStatus);
  }, [missionStatus, setMissionStatus]);

  const rawId = currentId ?? paramsId ?? "new";
  const isNewIntent = !rawId || typeof rawId !== "string" || rawId.trim() === "";
  const effectiveId = isNewIntent ? "new" : rawId;

  const urlHasId = typeof window !== "undefined" && window.location.search.includes("id=");
  const waitingForId = urlHasId && (effectiveId === "new" || effectiveId === "");

  const queryResult = useLiveQuery(async () => {
    if (!effectiveId || effectiveId === "new")
      return { report: null as Report | null, loaded: false };
    const report = await getRepository("reports").get(effectiveId);
    return { report: report ?? null, loaded: true };
  }, [effectiveId]);

  const report = queryResult?.loaded ? queryResult.report : undefined;
  const isLoading = queryResult === undefined || (effectiveId !== "new" && !queryResult?.loaded);
  const notFound =
    effectiveId !== "new" && queryResult?.loaded === true && queryResult.report === null;

  const reportId = effectiveId && effectiveId !== "new" ? effectiveId : "";
  const isNew = effectiveId === "new";

  useEffect(() => {
    setViewMode({ type: "report" });
  }, [effectiveId, setViewMode]);

  useEffect(() => {
    setEditMode(paramsMode ?? "edit");
  }, [paramsMode, setEditMode]);

  const handleSwitchToEdit = useCallback(() => {
    if (!missionStatus.canEdit) return;
    setEditMode("edit");
    navigate(`/reports/edit?id=${effectiveId}&mode=edit`, { replace: true });
  }, [effectiveId, missionStatus.canEdit, setEditMode, navigate]);

  const handleSwitchToView = useCallback(() => {
    setEditMode("view");
    navigate(`/reports/edit?id=${effectiveId}&mode=view`, { replace: true });
  }, [effectiveId, setEditMode, navigate]);

  return {
    paramsId,
    currentId,
    setCurrentId,
    justSavedNewRef,
    viewMode,
    setViewMode,
    editMode,
    setEditMode,
    effectiveId,
    isNewIntent,
    isNew,
    isReadOnly,
    waitingForId,
    isLoading,
    notFound,
    report,
    reportId,
    missionStatus,
    handleSwitchToEdit,
    handleSwitchToView,
  };
}
