import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Save, ArrowLeft, Eye, Edit2, AlertTriangle, CheckCircle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@citadel/ui";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { InstrumentEdit } from "@/components/InstrumentEdit";
import { reportError } from "@citadel/monitoring";
import { notify } from "@/services/notify";
import { completeReport } from "@/services/report";
import { useReportEditState } from "./useReportEditState";
import { useReportForm } from "./useReportForm";
import { useReportEditDomainStore } from "./store";
import { ReportFormView } from "./ReportFormView";
import { TargetInstrumentsSection } from "./TargetInstrumentsSection";
import { UsedPartsSection } from "./UsedPartsSection";
import { ReportOwnedInstrumentsSection } from "./ReportOwnedInstrumentsSection";

export function ReportEditFeature(): React.ReactElement {
  const [reportTypeOptions, setReportTypeOptions] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const isOnline = useOnlineStatus();
  const setOnline = useReportEditDomainStore((s) => s.setOnline);

  useEffect(() => {
    setOnline(isOnline);
  }, [isOnline, setOnline]);

  const {
    setCurrentId,
    justSavedNewRef,
    viewMode,
    setViewMode,
    effectiveId,
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
  } = useReportEditState();

  const form = useReportForm(
    effectiveId,
    report,
    setCurrentId,
    justSavedNewRef,
    reportTypeOptions,
    setReportTypeOptions
  );

  if (waitingForId) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="mx-auto max-w-xl text-center text-gray-500">レポートを読み込み中...</div>
      </main>
    );
  }

  if (effectiveId && effectiveId !== "new" && isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="mx-auto max-w-xl text-center text-gray-500">読み込み中...</div>
      </main>
    );
  }

  if (effectiveId && effectiveId !== "new" && notFound) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 sm:p-6" data-testid="report-not-found">
        <div className="mx-auto max-w-xl">
          <p className="text-gray-600">該当するレポートが見つかりません。</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/reports"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-gray-200 px-4 py-3 text-gray-700 hover:bg-gray-300"
            >
              <ArrowLeft className="h-5 w-5" />
              一覧へ戻る
            </Link>
            {missionStatus.canEdit && (
              <Link
                to="/reports/edit"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-white hover:bg-blue-700"
              >
                新規作成
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (viewMode.type === "instrument") {
    return (
      <main className="min-h-screen bg-gray-50">
        <InstrumentEdit
          reportId={reportId}
          instrumentId={viewMode.instrumentId}
          onBack={() => setViewMode({ type: "report" })}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-800 sm:text-2xl">
              {isNew ? "レポート新規作成" : "レポート編集"}
            </h1>
            {!isNew && (
              <span
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
                  isReadOnly ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-800"
                }`}
              >
                {isReadOnly ? (
                  <>
                    <Eye className="h-3 w-3" />
                    閲覧モード
                  </>
                ) : (
                  <>
                    <Edit2 className="h-3 w-3" />
                    編集モード
                  </>
                )}
              </span>
            )}
            {!isOnline && (
              <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                オフライン
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!isNew && isOnline && reportId && (
              <button
                type="button"
                disabled={completing}
                onClick={async () => {
                  setCompleting(true);
                  try {
                    await completeReport(reportId);
                    notify.success("レポートを完了し、スナップショットを保存しました。");
                  } catch (e) {
                    reportError(e, { feature: "report", action: "complete" });
                    const msg = e instanceof Error ? e.message : "完了に失敗しました";
                    notify.error(msg);
                  } finally {
                    setCompleting(false);
                  }
                }}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-emerald-600 bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <CheckCircle className="h-5 w-5" />
                完了する
              </button>
            )}
            {!isNew && (
              <>
                {isReadOnly ? (
                  <button
                    type="button"
                    onClick={handleSwitchToEdit}
                    disabled={!missionStatus.canEdit}
                    className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                  >
                    <Edit2 className="h-5 w-5" />
                    編集モードに切り替え
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSwitchToView}
                    className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Eye className="h-5 w-5" />
                    閲覧モードに切り替え
                  </button>
                )}
                <button
                  type="button"
                  onClick={form.onDownloadJson}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                >
                  <Download className="h-5 w-5" />
                  <span className="hidden sm:inline">JSON</span>
                </button>
              </>
            )}
            <Link
              to="/reports"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
        </div>

        {isReadOnly && (
          <Alert
            variant="warning"
            className="mb-4 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">編集できません</AlertTitle>
            <AlertDescription>
              <p className="mb-1 text-sm text-amber-800 dark:text-amber-200">
                {missionStatus.isExpired
                  ? "任務の有効期限が切れているため、編集はできません。データ管理画面で退避データの生成または初期化を行ってください。"
                  : missionStatus.hasMission && missionStatus.mission?.permission === "View"
                    ? "この端末には「閲覧のみ」の権限が付与されているため、編集・新規作成はできません。データ採集または編集権限が必要な場合は管理者に連絡してください。"
                    : "閲覧モードのため編集はできません。編集モードに切り替えるか、任務の編集権限を確認してください。"}
              </p>
              {import.meta.env.DEV && missionStatus.mission && (
                <p
                  className="mt-2 text-xs text-amber-700 dark:text-amber-300"
                  aria-label="デバッグ情報（時刻ずれの診断）"
                >
                  端末時刻: {missionStatus.deviceTimeIso} / サーバー基準時刻:{" "}
                  {missionStatus.serverTimeIso} / オフセット: {missionStatus.serverTimeOffsetMs}ms /
                  任務有効期限: {missionStatus.mission.expiresAt}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {submitError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {submitError}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit(async (values) => {
              setSubmitError(null);
              try {
                await form.onSave(values);
              } catch (err) {
                reportError(err, { feature: "report", action: "save" });
                setSubmitError("保存に失敗しました。");
              }
            })(e);
          }}
          className="space-y-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
        >
          <ReportFormView
            register={form.register}
            control={form.control}
            setValue={form.setValue}
            getValues={form.getValues}
            errors={form.errors}
            isReadOnly={isReadOnly}
            workerRoleKeys={form.workerRoleKeys}
            clientRoleKeys={form.clientRoleKeys}
            siteRoleKeys={form.siteRoleKeys}
            reportTypeOptions={reportTypeOptions}
          />
          {!isReadOnly && (
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                disabled={form.isSubmitting}
                onClick={() =>
                  form.handleSubmit(async (values) => {
                    setSubmitError(null);
                    try {
                      await form.onSave(values);
                    } catch (err) {
                      reportError(err, { feature: "report", action: "save" });
                      setSubmitError("保存に失敗しました。");
                    }
                  })()
                }
                className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-base font-medium text-white hover:bg-blue-700 disabled:opacity-50 active:bg-blue-800"
              >
                <Save className="h-5 w-5" />
                保存
              </button>
              <Link
                to="/reports"
                className="flex min-h-[48px] items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
              >
                キャンセル
              </Link>
            </div>
          )}
        </form>

        {!isNew && <TargetInstrumentsSection />}

        {effectiveId && effectiveId !== "new" && (
          <>
            <UsedPartsSection />
            <ReportOwnedInstrumentsSection />
          </>
        )}

        <div className="mt-4">
          <Link
            to="/"
            className="inline-flex min-h-[44px] items-center rounded-lg px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            トップへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
