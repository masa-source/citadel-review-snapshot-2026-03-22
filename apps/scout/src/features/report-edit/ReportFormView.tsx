import { useMemo, memo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SortableButtons } from "@/components/SortableButtons";
import { useFieldArray, Controller, useWatch } from "react-hook-form";
import type {
  UseFormRegister,
  FieldErrors,
  Control,
  UseFormSetValue,
  UseFormGetValues,
} from "react-hook-form";
import { useLiveQuery } from "dexie-react-hooks";
import { getRepository } from "@/services/data";
import { SuggestInput } from "@/components/SuggestInput";
import { SchemaCustomDataSection } from "@/components/SchemaCustomDataSection";
import { reportFormSchema, getStringMaxLength } from "@citadel/types";
import type { Site } from "@citadel/types";
import type { ReportFormValues } from "./types";

export interface ReportFormViewProps {
  register: UseFormRegister<ReportFormValues>;
  control: Control<ReportFormValues>;
  setValue: UseFormSetValue<ReportFormValues>;
  getValues: UseFormGetValues<ReportFormValues>;
  errors: FieldErrors<ReportFormValues>;
  isReadOnly: boolean;
  workerRoleKeys?: string[];
  clientRoleKeys?: string[];
  siteRoleKeys?: string[];
  reportTypeOptions: string[];
}

/**
 * タイトルの文字数カウントを表示するサブコンポーネント（タイトル編集時のみ再レンダリング）
 */
const TitleCounter = ({ control }: { control: Control<ReportFormValues> }) => {
  const title = useWatch({ control, name: "reportTitle" });
  return (
    <p className="mt-0.5 text-xs text-gray-500">
      {title?.length ?? 0} / {getStringMaxLength(reportFormSchema.shape.reportTitle)}文字
    </p>
  );
};

/**
 * 現場ラベル（現場の選択状態を監視して、特定の現場名のみ再描画）
 * 表示: 現場名（所在地）。所在地が無い場合は現場名のみ。
 */
const SiteRowLabel = ({
  index,
  control,
  sites,
}: {
  index: number;
  control: Control<ReportFormValues>;
  sites: Site[] | undefined;
}) => {
  const siteIdVal = useWatch({ control, name: `siteRows.${index}.siteId` });
  const site = sites?.find((s) => s.id === siteIdVal);
  const label = site?.location
    ? `${site.name ?? ""}（${site.location}）`
    : (site?.name ?? siteIdVal);
  return <>{label}</>;
};

export const ReportFormView = memo(function ReportFormView({
  register,
  control,
  setValue,
  getValues,
  errors,
  isReadOnly,
  workerRoleKeys = ["leader", "assistant"],
  clientRoleKeys = ["owner"],
  siteRoleKeys = ["main", "sub"],
  reportTypeOptions,
}: ReportFormViewProps): React.ReactElement {
  const companyRepo = useMemo(() => getRepository("companies"), []);
  const siteRepo = useMemo(() => getRepository("sites"), []);
  const workerRepo = useMemo(() => getRepository("workers"), []);
  const companies = useLiveQuery(() => companyRepo.list(), [companyRepo]);
  const sites = useLiveQuery(() => siteRepo.list(), [siteRepo]);
  const workers = useLiveQuery(() => workerRepo.list(), [workerRepo]);

  const {
    fields: siteFields,
    append: appendSite,
    remove: removeSite,
  } = useFieldArray({
    control,
    name: "siteRows",
  });

  const {
    fields: workerFields,
    append: appendWorker,
    remove: removeWorker,
    swap: swapWorker,
  } = useFieldArray({
    control,
    name: "workerRows",
  });

  const {
    fields: clientFields,
    append: appendClient,
    remove: removeClient,
  } = useFieldArray({
    control,
    name: "clientRows",
  });

  const schemaId = useWatch({ control, name: "schemaId" });
  const customData = useWatch({ control, name: "customData" }) || {};

  const inputBase = `w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isReadOnly ? "bg-gray-100 text-gray-700" : ""}`;
  const textareaBase = `w-full min-h-[80px] rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y ${isReadOnly ? "bg-gray-100 text-gray-700" : ""}`;

  return (
    <div className={isReadOnly ? "pointer-events-none select-text" : ""}>
      <div className="space-y-5">
        <div>
          <label htmlFor="reportType" className="mb-1 block text-sm font-medium text-gray-700">
            報告書種別
          </label>
          <select
            id="reportType"
            disabled={isReadOnly}
            className={inputBase}
            {...register("reportType")}
          >
            <option value="">— 選択 —</option>
            {reportTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reportTitle" className="mb-1 block text-sm font-medium text-gray-700">
            タイトル
          </label>
          <textarea
            id="reportTitle"
            rows={3}
            readOnly={isReadOnly}
            maxLength={getStringMaxLength(reportFormSchema.shape.reportTitle)}
            className={textareaBase}
            {...register("reportTitle")}
          />
          <TitleCounter control={control} />
          {errors.reportTitle && (
            <p className="mt-1 text-sm text-red-600">{errors.reportTitle.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="controlNumber" className="mb-1 block text-sm font-medium text-gray-700">
            管理番号
          </label>
          <input
            id="controlNumber"
            type="text"
            readOnly={isReadOnly}
            className={inputBase}
            {...register("controlNumber")}
          />
        </div>
        <div>
          <label htmlFor="createdAt" className="mb-1 block text-sm font-medium text-gray-700">
            作成日時
          </label>
          <input
            id="createdAt"
            type="datetime-local"
            readOnly={isReadOnly}
            className={inputBase}
            {...register("createdAt")}
          />
        </div>
        <div>
          <label htmlFor="companyId" className="mb-1 block text-sm font-medium text-gray-700">
            会社
          </label>
          <Controller
            control={control}
            name="companyId"
            render={({ field }) => (
              <select id="companyId" {...field} disabled={isReadOnly} className={inputBase}>
                <option value="">— 選択 —</option>
                {companies?.map((c) => (
                  <option key={String(c.id ?? "")} value={String(c.id ?? "")}>
                    {c.name ?? `ID: ${c.id}`}
                  </option>
                ))}
              </select>
            )}
          />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-5 mt-5">
        <h2 className="mb-4 text-base font-semibold text-gray-800">報告書メタデータ</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">取引先</label>
            <div className="flex flex-col gap-2">
              {clientFields.length > 0 && (
                <ul className="space-y-2">
                  {clientFields.map((field, index) => (
                    <li
                      key={field.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/50 p-2"
                    >
                      <Controller
                        control={control}
                        name={`clientRows.${index}.companyId`}
                        render={({ field: clientField }) => (
                          <select
                            {...clientField}
                            disabled={isReadOnly}
                            className="min-h-[36px] flex-1 rounded border border-gray-300 px-2 py-1 text-sm sm:min-w-[140px]"
                          >
                            <option value="">— 選択 —</option>
                            {companies?.map((c) => (
                              <option key={String(c.id ?? "")} value={String(c.id ?? "")}>
                                {c.name ?? c.id}
                              </option>
                            ))}
                          </select>
                        )}
                      />
                      <Controller
                        control={control}
                        name={`clientRows.${index}.roleKey`}
                        render={({ field: { value, onChange } }) => (
                          <SuggestInput
                            listId={`report-client-role-${field.id}`}
                            value={value ?? ""}
                            onChange={onChange}
                            options={clientRoleKeys}
                            disabled={isReadOnly}
                            placeholder="役割（選択または入力）"
                            className="min-h-[36px] w-36 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                            aria-label="役割"
                          />
                        )}
                      />
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => removeClient(index)}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                          aria-label="削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!isReadOnly && (
                <div className="flex flex-wrap gap-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) {
                        appendClient({ companyId: id, roleKey: "owner" });
                      }
                      e.target.value = "";
                    }}
                    className="min-h-[36px] rounded-lg border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="">— 取引先を追加 —</option>
                    {companies
                      ?.filter(
                        (c) =>
                          c.id &&
                          !clientFields.some(
                            (_, i) => getValues(`clientRows.${i}.companyId`) === c.id
                          )
                      )
                      .map((c) => (
                        <option key={String(c.id ?? "")} value={String(c.id ?? "")}>
                          {c.name ?? c.id}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
            {clientFields.length === 0 && (
              <p className="mt-1 text-sm text-gray-500">取引先がありません</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">現場</label>
            <div className="flex flex-wrap gap-2">
              {siteFields.map((field, index) => {
                return (
                  <span
                    key={field.id}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-800"
                  >
                    <SiteRowLabel index={index} control={control} sites={sites} />
                    {!isReadOnly && (
                      <>
                        <Controller
                          control={control}
                          name={`siteRows.${index}.roleKey`}
                          render={({ field: { value, onChange } }) => (
                            <SuggestInput
                              listId={`new-site-role-${field.id}`}
                              value={value ?? ""}
                              onChange={(v) => onChange(v)}
                              options={siteRoleKeys}
                              placeholder="役割"
                              className="min-h-[28px] w-24 rounded border border-gray-300 px-2 py-0.5 text-xs"
                              aria-label="役割"
                            />
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => removeSite(index)}
                          className="rounded p-0.5 hover:bg-gray-200"
                          aria-label="削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </span>
                );
              })}
              {!isReadOnly && sites && (
                <select
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id && !siteFields.some((r) => r.siteId === id)) {
                      appendSite({ siteId: id, roleKey: "main" });
                    }
                    e.target.value = "";
                  }}
                  className="min-h-[36px] rounded-lg border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="">— 現場を追加 —</option>
                  {sites
                    .filter((s) => s.id && !siteFields.some((r) => r.siteId === s.id))
                    .map((s) => (
                      <option key={String(s.id ?? "")} value={String(s.id ?? "")}>
                        {s.location ? `${s.name ?? ""}（${s.location}）` : (s.name ?? s.id ?? "")}
                      </option>
                    ))}
                </select>
              )}
            </div>
            {siteFields.length === 0 && (
              <p className="mt-1 text-sm text-gray-500">現場がありません</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">担当者</label>
            <ul className="space-y-2">
              {workerFields.map((field, index) => (
                <li
                  key={field.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/50 p-2"
                >
                  {!isReadOnly && (
                    <SortableButtons
                      onMoveUp={() => swapWorker(index, index - 1)}
                      onMoveDown={() => swapWorker(index, index + 1)}
                      isFirst={index <= 0}
                      isLast={index >= workerFields.length - 1}
                      className="shrink-0 flex-col"
                      buttonClassName="min-h-[28px] min-w-[28px] text-gray-600 hover:bg-gray-200"
                      iconClassName="h-3.5 w-3.5"
                    />
                  )}
                  <select
                    {...register(`workerRows.${index}.workerId`)}
                    disabled={isReadOnly}
                    className="min-h-[36px] flex-1 rounded border border-gray-300 px-2 py-1 text-sm sm:min-w-[140px]"
                  >
                    <option value="">— 選択 —</option>
                    {workers?.map((w) => (
                      <option key={String(w.id ?? "")} value={String(w.id ?? "")}>
                        {w.name ?? w.id}
                      </option>
                    ))}
                  </select>
                  <Controller
                    control={control}
                    name={`workerRows.${index}.roleKey`}
                    render={({ field: { value, onChange } }) => (
                      <SuggestInput
                        listId={`report-worker-role-${field.id}`}
                        value={value ?? ""}
                        onChange={(key) => {
                          onChange(key);
                          setValue(`workerRows.${index}.workerRole`, key, { shouldDirty: true });
                        }}
                        options={workerRoleKeys}
                        disabled={isReadOnly}
                        placeholder="役割（選択または入力）"
                        className="min-h-[36px] w-36 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                        aria-label="役割"
                      />
                    )}
                  />
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => removeWorker(index)}
                      className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                      aria-label="削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
              {!isReadOnly && (
                <li>
                  <button
                    type="button"
                    onClick={() =>
                      appendWorker({
                        workerId: "",
                        workerRole: "",
                        roleKey: "",
                      })
                    }
                    className="flex min-h-[36px] items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4" />
                    担当者を追加
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-5 mt-5">
        <SchemaCustomDataSection
          targetEntity="report"
          schemaId={schemaId ?? ""}
          onSchemaIdChange={(id) => {
            setValue("schemaId", id, { shouldDirty: true });
            setValue("customData", {}, { shouldDirty: true });
          }}
          customData={customData as Record<string, unknown>}
          onCustomDataChange={(data) => {
            setValue("customData", data, { shouldDirty: true });
          }}
          readOnly={isReadOnly}
          sectionTitle="カスタムデータ（スキーマ定義）"
        />
      </div>
    </div>
  );
});
