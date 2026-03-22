import React from "react";

export interface MasterFormActionsProps {
  mode: "create" | "edit";
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel?: string;
  cancelLabel?: string;
}

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const SaveIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
    />
  </svg>
);

const SpinnerIcon = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export function MasterFormActions({
  mode,
  onSave,
  onCancel,
  saving,
  saveLabel,
  cancelLabel = "キャンセル",
}: MasterFormActionsProps): React.ReactElement {
  const label = saveLabel ?? (mode === "create" ? "作成" : "保存");
  return (
    <div className="flex gap-2 mt-4">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className={
          saving
            ? "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors bg-gray-400 cursor-not-allowed"
            : "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors bg-indigo-600 hover:bg-indigo-700"
        }
      >
        {saving ? <SpinnerIcon /> : mode === "create" ? <PlusIcon /> : <SaveIcon />}
        {label}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
      >
        <XIcon />
        {cancelLabel}
      </button>
    </div>
  );
}
