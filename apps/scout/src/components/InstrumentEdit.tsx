import { useCallback, useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLiveQuery } from "dexie-react-hooks";
import { Save, ArrowLeft } from "lucide-react";

import { getRepository } from "@/services/data";
import { SchemaCustomDataSection } from "@/components/SchemaCustomDataSection";
import { TargetInstrumentTablesForm } from "@/components/TargetInstrumentTablesForm";
import type { TargetInstrument } from "@citadel/types";
import { generateUUID } from "@/utils/uuid";
import {
  instrumentFormSchema,
  getStringMaxLength,
  parseCustomData,
  type InstrumentFormValues,
} from "@citadel/types";

type Props = {
  reportId: string;
  instrumentId: string | "new";
  onBack: () => void;
};

export function InstrumentEdit({ reportId, instrumentId, onBack }: Props) {
  const isNew = instrumentId === "new";
  const targetInstrumentsRepo = getRepository("targetInstruments");

  const instrument = useLiveQuery(async () => {
    if (isNew) return null;
    return targetInstrumentsRepo.get(instrumentId);
  }, [instrumentId, isNew, targetInstrumentsRepo]);

  const instrumentRepo = getRepository("instruments");
  const companyRepo = getRepository("companies");
  const instruments = useLiveQuery(() => instrumentRepo.list(), [instrumentRepo]);
  const companies = useLiveQuery(() => companyRepo.list(), [companyRepo]);

  const [customData, setCustomData] = useState<Record<string, unknown>>({});

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<InstrumentFormValues>({
    defaultValues: {
      instrumentId: "",
      tagNumber: "",
      schemaId: "",
    },
    resolver: zodResolver(instrumentFormSchema),
  });

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (instrument) {
      reset({
        instrumentId: instrument.instrumentId != null ? String(instrument.instrumentId) : "",
        tagNumber: instrument.tagNumber ?? "",
        schemaId: instrument.schemaId != null ? String(instrument.schemaId) : "",
      });
      timer = setTimeout(() => setCustomData(parseCustomData(instrument.customData)), 0);
    } else if (isNew) {
      reset({
        instrumentId: "",
        tagNumber: "",
        schemaId: "",
      });
      timer = setTimeout(() => setCustomData(parseCustomData(undefined)), 0);
    }
    return () => clearTimeout(timer);
  }, [instrument, isNew, reset]);

  const selectedInstrumentIdStr = useWatch({ control, name: "instrumentId" });
  const tagNumberWatch = useWatch({ control, name: "tagNumber" });
  const schemaIdWatch = useWatch({ control, name: "schemaId" });
  const selectedInstrument =
    instruments?.find((i) => i.id != null && String(i.id) === selectedInstrumentIdStr) ?? null;
  const selectedCompanyName =
    selectedInstrument?.companyId != null && companies
      ? (companies.find((c) => c.id === selectedInstrument.companyId)?.name ?? "—")
      : "—";

  const onSave = useCallback(
    async (values: InstrumentFormValues) => {
      const payload: Partial<TargetInstrument> = {
        reportId,
        instrumentId: values.instrumentId || undefined,
        tagNumber: values.tagNumber || undefined,
        schemaId: values.schemaId || undefined,
        customData: Object.keys(customData).length > 0 ? customData : undefined,
      };

      if (isNew) {
        const existing = await targetInstrumentsRepo.getByReportId(reportId);
        const maxOrder =
          existing.length === 0 ? -1 : Math.max(...existing.map((e) => e.sortOrder ?? 0));
        await targetInstrumentsRepo.add({
          ...payload,
          id: generateUUID(),
          sortOrder: maxOrder + 1,
        } as TargetInstrument);
      } else {
        await targetInstrumentsRepo.update(instrumentId, payload);
      }
      onBack();
    },
    [reportId, instrumentId, isNew, onBack, targetInstrumentsRepo, customData]
  );

  // 編集時は instrument、ドロップダウン用マスタ（instruments, companies）の読み込み完了まで待つ
  if (
    (!isNew && instrument === undefined) ||
    instruments === undefined ||
    companies === undefined
  ) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="mx-auto max-w-xl text-center text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (!isNew && instrument === null) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="mx-auto max-w-xl">
          <p className="text-gray-600">該当する対象機器が見つかりません。</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-gray-200 px-4 py-3 text-gray-700 hover:bg-gray-300"
          >
            <ArrowLeft className="h-5 w-5" />
            レポート編集へ戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800 sm:text-2xl">
            {isNew ? "対象機器を追加" : "対象機器の編集"}
          </h1>
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit(onSave)}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
        >
          <div>
            <label htmlFor="instrumentId" className="mb-1 block text-sm font-medium text-gray-700">
              計器マスタ（機器）
            </label>
            <select
              id="instrumentId"
              className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              {...register("instrumentId")}
            >
              <option value="">— 選択 —</option>
              {instruments?.map((i) => (
                <option key={i.id} value={i.id ?? ""}>
                  {i.name ?? ""}
                  {i.modelNumber ? ` (${i.modelNumber})` : ""}
                </option>
              ))}
            </select>
          </div>
          {selectedInstrument && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <p className="font-medium text-gray-800">選択中の計器（参照）</p>
              <ul className="mt-1 list-none space-y-0.5">
                <li>機器名: {selectedInstrument.name ?? "—"}</li>
                <li>型番: {selectedInstrument.modelNumber ?? "—"}</li>
                <li>会社（メーカー）: {selectedCompanyName}</li>
              </ul>
            </div>
          )}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">個体情報</h3>
          </div>
          <div>
            <label htmlFor="tagNumber" className="mb-1 block text-sm font-medium text-gray-700">
              タグ番号
            </label>
            <input
              id="tagNumber"
              type="text"
              maxLength={getStringMaxLength(instrumentFormSchema.shape.tagNumber)}
              className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              {...register("tagNumber")}
            />
            <p className="mt-0.5 text-xs text-gray-500">
              {tagNumberWatch?.length ?? 0} /{" "}
              {getStringMaxLength(instrumentFormSchema.shape.tagNumber) ?? "—"}
              文字
            </p>
            {errors.tagNumber && (
              <p className="mt-1 text-sm text-red-600">{errors.tagNumber.message}</p>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-base font-medium text-white hover:bg-blue-700 disabled:opacity-50 active:bg-blue-800"
            >
              <Save className="h-5 w-5" />
              保存
            </button>
            <button
              type="button"
              onClick={onBack}
              className="flex min-h-[48px] items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </form>

        <SchemaCustomDataSection
          targetEntity="targetInstrument"
          schemaId={schemaIdWatch ?? ""}
          onSchemaIdChange={(id) => {
            setValue("schemaId", id);
            setCustomData({});
          }}
          customData={customData}
          onCustomDataChange={setCustomData}
          readOnly={false}
          className="mt-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
          sectionTitle="カスタムデータ（スキーマ定義）"
        />

        {!isNew && (
          <section className="mt-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <TargetInstrumentTablesForm targetInstrumentId={instrumentId} reportId={reportId} />
          </section>
        )}
      </div>
    </div>
  );
}
