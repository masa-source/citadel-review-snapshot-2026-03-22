import React, { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { apiClient, unwrap } from "@/utils/api";
import {
  schemasToBuilderFields,
  builderFieldsToJsonSchema,
  builderFieldsToUiSchema,
} from "@/features/schema-builder/utils/schemaTransform";
import { PALETTE_ITEMS, FIELD_TYPE_LABELS } from "@/features/schema-builder/constants";
import {
  type BuilderField,
  type BuilderFieldType,
  generateBuilderFieldId,
} from "@/features/schema-builder/types";

/** API から返るスキーマ定義 1 件（camelCase） */
type SchemaDefinitionItem = {
  id?: string | null;
  targetEntity?: string | null;
  version?: string | null;
  jsonSchema?: Record<string, unknown> | null;
  uiSchema?: Record<string, unknown> | null;
};

function SortableFieldRow({
  field,
  index,
  onUpdate,
  onRemove,
}: {
  field: BuilderField;
  index: number;
  onUpdate: (index: number, patch: Partial<BuilderField>) => void;
  onRemove: (index: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasEnum = field.fieldType === "dropdown" || field.fieldType === "radio";
  const enumStr = Array.isArray(field.enum) ? field.enum.join(", ") : "";

  // キー入力用のローカル状態（即座に BuilderField.id を書き換えないことでフォーカス喪失を防ぐ）
  const [keyInput, setKeyInput] = useState(field.id);

  const commitKeyChange = () => {
    const next = keyInput.trim();
    if (!next || next === field.id) {
      // 空文字や変更なしの場合は元の値に戻す
      setKeyInput(field.id);
      return;
    }
    onUpdate(index, { id: next });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-wrap items-start gap-2 rounded-lg border bg-white p-3 ${
        isDragging ? "z-10 shadow-md opacity-90" : "border-gray-200"
      }`}
    >
      <button
        type="button"
        className="mt-1.5 touch-none cursor-grab rounded p-1 text-gray-400 hover:bg-gray-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="並び替え"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-gray-500">キー（英数字）</label>
          <input
            type="text"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onBlur={commitKeyChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitKeyChange();
              }
            }}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500">種別</label>
          <select
            value={field.fieldType}
            onChange={(e) => onUpdate(index, { fieldType: e.target.value as BuilderFieldType })}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {(Object.entries(FIELD_TYPE_LABELS) as [BuilderFieldType, string][]).map(
              ([t, label]) => (
                <option key={t} value={t}>
                  {label}
                </option>
              )
            )}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500">タイトル（ラベル）</label>
          <input
            type="text"
            value={field.title}
            onChange={(e) => onUpdate(index, { title: e.target.value })}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={!!field.required}
              onChange={(e) => onUpdate(index, { required: e.target.checked })}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">必須</span>
          </label>
        </div>
      </div>
      {hasEnum && (
        <div className="w-full">
          <label className="block text-xs font-medium text-gray-500">選択肢（カンマ区切り）</label>
          <input
            type="text"
            value={enumStr}
            onChange={(e) =>
              onUpdate(index, {
                enum: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="選択肢1, 選択肢2"
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="mt-1.5 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
        aria-label="削除"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function SchemaDefinitionBuilderPage(): React.ReactElement {
  const params = useParams();
  const id = params?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetEntity, setTargetEntity] = useState("");
  const [version, setVersion] = useState("");
  const [fields, setFields] = useState<BuilderField[]>([]);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setError("ID がありません。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- apiClient は動的パスで unwrap と型が合わないため
      const data = await unwrap((apiClient.GET as any)("/api/schema-definitions"));
      const list = Array.isArray(data) ? (data as SchemaDefinitionItem[]) : [];
      const item = list.find((x) => x.id === id) ?? null;
      if (!item) {
        setError("スキーマ定義が見つかりません。");
        setTargetEntity("");
        setVersion("");
        setFields([]);
        return;
      }
      setTargetEntity(item.targetEntity ?? "");
      setVersion(item.version ?? "");
      setFields(schemasToBuilderFields(item.jsonSchema ?? null, item.uiSchema ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました。");
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFields((prev) => {
      const ids = prev.map((f) => f.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const addField = (type: BuilderFieldType) => {
    const newField: BuilderField = {
      id: generateBuilderFieldId(),
      fieldType: type,
      title: FIELD_TYPE_LABELS[type],
      required: false,
    };
    setFields((prev) => [...prev, newField]);
  };

  const updateField = (index: number, patch: Partial<BuilderField>) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!id) return;
    try {
      await unwrap(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- apiClient は動的パスで unwrap と型が合わないため
        (apiClient.PUT as any)("/api/schema-definitions/{item_id}", {
          params: { path: { item_id: id } },
          body: {
            targetEntity: targetEntity || undefined,
            version: version || undefined,
            jsonSchema: builderFieldsToJsonSchema(fields),
            uiSchema: builderFieldsToUiSchema(fields),
          },
        })
      );
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました。");
    }
  };

  const [saving, setSaving] = useState(false);
  const onSaveClick = async () => {
    setSaving(true);
    try {
      await handleSave();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-gray-600">読み込み中…</p>
        </div>
      </div>
    );
  }

  if (error && !id) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-red-600">{error}</p>
          <Link
            to="/masters/schema-definitions"
            className="mt-4 inline-flex text-indigo-600 hover:underline"
          >
            スキーマ定義一覧に戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">スキーマビルダー</h1>
            <p className="text-sm text-gray-500">ID: {id ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={targetEntity}
              onChange={(e) => setTargetEntity(e.target.value)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm min-w-[180px]"
              aria-label="対象データ"
            >
              <option value="">— 選択 —</option>
              <option value="report">報告書 (report)</option>
              <option value="targetInstrument">対象機器 (targetInstrument)</option>
            </select>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="バージョン"
              className="w-24 rounded border border-gray-300 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={onSaveClick}
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
            <Link
              to="/masters/schema-definitions"
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              一覧に戻る
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* パレット */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 lg:col-span-1">
            <h2 className="mb-3 text-sm font-medium text-gray-700">フィールドを追加</h2>
            <ul className="space-y-1">
              {PALETTE_ITEMS.map(({ type, label }) => (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => addField(type)}
                    className="flex w-full items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    <Plus className="h-4 w-4 text-gray-400" />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* キャンバス */}
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 lg:col-span-2">
            <h2 className="text-sm font-medium text-gray-700">
              フィールド一覧（ドラッグで並び替え）
            </h2>
            {fields.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                左のパレットからフィールドを追加してください。
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={fields.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-2">
                    {fields.map((field, index) => (
                      <li key={field.id}>
                        <SortableFieldRow
                          field={field}
                          index={index}
                          onUpdate={updateField}
                          onRemove={removeField}
                        />
                      </li>
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
