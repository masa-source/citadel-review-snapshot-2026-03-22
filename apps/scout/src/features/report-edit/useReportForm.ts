import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLiveQuery } from "dexie-react-hooks";
import {
  parseCustomData,
  reportFormSchema,
  type ReportFormValues,
  type ReportFormat,
} from "@citadel/types";
import { notify } from "@/services/notify";
import { saveReport } from "@/services/report";
import { getRepository } from "@/services/data";
import type { Report } from "@citadel/types";

const defaultFormValues: ReportFormValues = {
  reportType: "",
  reportFormatId: "",
  reportTitle: "",
  controlNumber: "",
  createdAt: "",
  companyId: "",
  schemaId: "",
  clientRows: [],
  siteRows: [],
  workerRows: [],
  customData: {},
};

type ReportFormatOption = { id: string; name: string };

/** Dexie から ReportFormat 一覧を取得し、選択肢として返す */
function useReportFormatOptions(): ReportFormatOption[] {
  const repo = getRepository("reportFormats");
  const formats = useLiveQuery<ReportFormat[]>(() => repo.list(), [repo]) ?? [];
  const options = formats
    .map((f) => ({
      id: String(f.id ?? ""),
      name: f.name || "",
    }))
    .filter((o) => o.id && o.name.trim() !== "");
  return options.sort((a, b) => a.name.localeCompare(b.name));
}

/** Dexie から既存の workerRoleKey 一覧を取得し、選択肢として返す */
function useWorkerRoleKeys(): string[] {
  const reportWorkersRepo = getRepository("reportWorkers");
  const liveWorkers = useLiveQuery(() => reportWorkersRepo.list(), []);

  const keys = Array.from(
    new Set(
      (liveWorkers ?? [])
        .map((rw) => rw.roleKey)
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    )
  ).sort();

  if (keys.length === 0) {
    return ["leader", "assistant"];
  }
  return keys;
}

/** Dexie から既存の取引先 roleKey 一覧を取得し、選択肢として返す */
function useClientRoleKeys(): string[] {
  const reportClientsRepo = getRepository("reportClients");
  const liveClients = useLiveQuery(() => reportClientsRepo.list(), []);

  const keys = Array.from(
    new Set(
      (liveClients ?? [])
        .map((rc) => rc.roleKey)
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    )
  ).sort();

  if (keys.length === 0) {
    return ["owner"];
  }
  return keys;
}

export function useReportForm(
  effectiveId: string,
  report: Report | null | undefined,
  setCurrentId: (id: string | null) => void,
  justSavedNewRef: React.MutableRefObject<boolean>,
  reportTypeOptions: string[],
  setReportTypeOptions: React.Dispatch<React.SetStateAction<string[]>>
) {
  const navigate = useNavigate();

  // Dexie から役割キーと報告種別を取得
  const workerRoleKeys = useWorkerRoleKeys();
  const clientRoleKeys = useClientRoleKeys();
  const siteRoleKeys = ["main", "sub"];
  const reportFormatOptions = useReportFormatOptions();

  const liveReportTypeOptions = useMemo(
    () => reportFormatOptions.map((o) => o.name),
    [reportFormatOptions]
  );

  // liveReportTypeOptions が変化したら親の state を同期する
  useEffect(() => {
    setReportTypeOptions(liveReportTypeOptions);
  }, [liveReportTypeOptions, setReportTypeOptions, reportFormatOptions]);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ReportFormValues>({
    defaultValues: defaultFormValues,
    resolver: zodResolver(reportFormSchema),
  });

  const toDatetimeLocal = (s: string | null | undefined) =>
    !s ? "" : s.includes("T") ? s.slice(0, 16) : s;

  const lastHydratedReportIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (effectiveId === "new") {
      reset(defaultFormValues);
      lastHydratedReportIdRef.current = "new";
      return;
    }
    if (!report) return;
    const reportIdForHydrate = report.id != null ? String(report.id) : null;
    if (lastHydratedReportIdRef.current === reportIdForHydrate) {
      return;
    }

    // 非同期で子テーブルデータをまとめて取得して RHF に一括 Hydrate する
    let cancelled = false;
    (async () => {
      lastHydratedReportIdRef.current = reportIdForHydrate;

      const [reportClients, reportSitesList, reportWorkersList] = await Promise.all([
        reportIdForHydrate ? getRepository("reportClients").getByReportId(reportIdForHydrate) : [],
        reportIdForHydrate ? getRepository("reportSites").getByReportId(reportIdForHydrate) : [],
        reportIdForHydrate ? getRepository("reportWorkers").getByReportId(reportIdForHydrate) : [],
      ]);

      if (cancelled) return;

      // ReportFormatId からラベルを解決（旧 reportType 互換は完全廃止）
      const formatNameFromId =
        (report.reportFormatId &&
          reportFormatOptions.find((o) => o.id === String(report.reportFormatId))?.name) ||
        "";
      const reportTypeLabel = formatNameFromId || "";

      reset({
        reportType: reportTypeLabel,
        reportFormatId: report.reportFormatId ? String(report.reportFormatId) : "",
        reportTitle: report.reportTitle ?? "",
        controlNumber: report.controlNumber ?? "",
        createdAt: toDatetimeLocal(report.createdAt) || "",
        companyId: report.companyId != null ? String(report.companyId) : "",
        schemaId: report.schemaId != null ? String(report.schemaId) : "",
        clientRows: reportClients.map((rc) => ({
          companyId: rc.companyId != null ? String(rc.companyId) : "",
          roleKey: rc.roleKey ?? "owner",
        })),
        siteRows: reportSitesList.map((rs) => ({
          siteId: String(rs.siteId ?? ""),
          roleKey: rs.roleKey ?? "main",
        })),
        workerRows: reportWorkersList.map((rw) => ({
          workerId: rw.workerId != null ? String(rw.workerId) : "",
          workerRole: rw.workerRole ?? "",
          roleKey: rw.roleKey ?? "",
        })),
        customData: parseCustomData(report.customData),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveId, report, reset]);

  // reportFormatOptions が後から届いた場合に reportType フィールドを補完する
  // （report より先に非同期ロードが完了しなかった場合の救済処理）
  useEffect(() => {
    if (reportFormatOptions.length === 0) return;
    const currentType = getValues("reportType");
    const currentFormatId = getValues("reportFormatId");
    // reportType がまだ空で reportFormatId が設定済みの場合のみ補完
    if (currentType === "" && currentFormatId) {
      const name = reportFormatOptions.find((o) => o.id === currentFormatId)?.name ?? "";
      if (name) {
        setValue("reportType", name, { shouldDirty: false });
      }
    }
  }, [reportFormatOptions, getValues, setValue]);

  const onSave = useCallback(
    async (values: ReportFormValues) => {
      const selectedFormat =
        reportFormatOptions.find((o) => o.name === values.reportType) ||
        reportFormatOptions.find((o) => o.id === values.reportFormatId);

      const payload = {
        reportType: values.reportType || undefined,
        reportFormatId: (selectedFormat?.id ?? values.reportFormatId) || undefined,
        reportTitle: values.reportTitle || undefined,
        controlNumber: values.controlNumber || undefined,
        createdAt: values.createdAt || undefined,
        companyId: values.companyId || undefined,
        updatedAt: new Date().toISOString(),
        schemaId: values.schemaId || undefined,
        customData:
          values.customData && Object.keys(values.customData).length > 0
            ? values.customData
            : undefined,
      };

      const rowsForSave = (values.siteRows ?? []).map((rs) => ({
        siteId: String(rs.siteId ?? ""),
        roleKey: rs.roleKey ?? "main",
      }));

      const clientRows = (values.clientRows ?? [])
        .filter((r) => r.companyId)
        .map((r) => ({
          companyId: r.companyId,
          roleKey: r.roleKey || "owner",
        }));

      const workerRowsForSave = (values.workerRows ?? []).filter((r) => r.workerId);

      const result = await saveReport({
        payload,
        siteRows: rowsForSave,
        clientRows,
        workerRows: workerRowsForSave,
        effectiveId,
      });

      if (result.newId) {
        const newPath = `/reports/edit?id=${result.newId}`;
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", newPath);
        }
        justSavedNewRef.current = true;
        setCurrentId(result.newId);
        navigate(newPath, { replace: true });
        notify.success("保存しました");
      } else if (effectiveId && effectiveId !== "new") {
        // 更新成功後、isDirty をリセットするために再度 reset(現在値) を掛ける
        reset(values);
        notify.success("保存しました");
      }
    },
    [effectiveId, navigate, setCurrentId, justSavedNewRef, reset, reportFormatOptions]
  );

  const onDownloadJson = useCallback(() => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${report.id ?? "export"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  return {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    getValues,
    errors,
    isSubmitting,
    isDirty,
    onSave,
    onDownloadJson,
    workerRoleKeys,
    clientRoleKeys,
    siteRoleKeys,
  };
}
