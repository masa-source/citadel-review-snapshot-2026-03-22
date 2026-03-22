import { create } from "zustand";
import type { MissionStatusResult } from "@/hooks/useMissionStatus";
import type { EditMode, ViewMode } from "../types";

interface ReportEditDomainState {
  missionStatus: MissionStatusResult | null;
  editMode: EditMode;
  isOnline: boolean;
  viewMode: ViewMode;

  setMissionStatus: (status: MissionStatusResult | null) => void;
  setEditMode: (mode: EditMode) => void;
  setOnline: (online: boolean) => void;
  setViewMode: (mode: ViewMode) => void;

  effectiveEditMode: EditMode;
  isReadOnly: boolean;
}

export const useReportEditDomainStore = create<ReportEditDomainState>((set) => ({
  missionStatus: null,
  editMode: "edit",
  isOnline: true,
  viewMode: { type: "report" },
  setMissionStatus: (missionStatus) =>
    set((s) => {
      const effectiveEditMode = (missionStatus?.canEdit ?? false) ? s.editMode : "view";
      return {
        missionStatus,
        effectiveEditMode,
        isReadOnly: effectiveEditMode === "view",
      };
    }),
  setEditMode: (editMode) =>
    set((s) => {
      const effectiveEditMode = (s.missionStatus?.canEdit ?? false) ? editMode : "view";
      return {
        editMode,
        effectiveEditMode,
        isReadOnly: effectiveEditMode === "view",
      };
    }),
  setOnline: (isOnline) => set({ isOnline }),
  setViewMode: (viewMode) => set({ viewMode }),
  effectiveEditMode: "edit",
  isReadOnly: false,
}));
