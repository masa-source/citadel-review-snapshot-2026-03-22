import React, { useEffect, useState } from "react";
import type { WidgetProps } from "@rjsf/utils";

/** formContext に渡す getRefOptions の型 */
export type GetRefOptions = (
  refTarget: string
) => Promise<Array<{ id: string; [k: string]: unknown }>>;

export interface RefSelectWidgetOptions {
  refTarget: string;
  labelKey?: string;
}

function getOptionsFromUiSchema(options: WidgetProps["options"]): RefSelectWidgetOptions | null {
  const opts = options as RefSelectWidgetOptions | undefined;
  if (!opts?.refTarget) return null;
  return { refTarget: opts.refTarget, labelKey: opts.labelKey ?? "name" };
}

export function RefSelectWidget(props: WidgetProps): React.ReactElement {
  const { id, value, onChange, disabled, readonly, registry, label } = props;
  const formContext = registry.formContext as { getRefOptions?: GetRefOptions } | undefined;
  const getRefOptions = formContext?.getRefOptions;
  const optionsConfig = getOptionsFromUiSchema(props.options ?? {});

  const [options, setOptions] = useState<Array<{ id: string; [k: string]: unknown }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getRefOptions || !optionsConfig) {
      setOptions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getRefOptions(optionsConfig.refTarget)
      .then((list) => {
        if (!cancelled) setOptions(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getRefOptions, optionsConfig?.refTarget]);

  if (!optionsConfig || !getRefOptions) {
    return (
      <input
        type="text"
        id={id}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        readOnly={readonly}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
      />
    );
  }

  const labelKey = optionsConfig.labelKey;
  const currentValue = value === null || value === undefined ? "" : String(value);

  return (
    <select
      id={id}
      name={id}
      value={currentValue}
      onChange={(e) => onChange(e.target.value || undefined)}
      disabled={disabled || readonly || loading}
      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
      aria-label={typeof label === "string" ? label : undefined}
    >
      <option value="">選択してください</option>
      {options.map((item) => (
        <option key={item.id} value={item.id}>
          {typeof item[labelKey] === "string" ? String(item[labelKey]) : item.id}
        </option>
      ))}
    </select>
  );
}
