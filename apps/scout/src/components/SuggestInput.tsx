/**
 * 候補を表示しつつ、新しい値をその場で入力できる入力欄。
 * 役割キー・検査表の select 列などで共通利用。
 */

type Props = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  options: string[];
  listId: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  type?: "text" | "number";
};

export function SuggestInput({
  value,
  onChange,
  onBlur,
  options,
  listId,
  placeholder,
  disabled,
  className,
  "aria-label": ariaLabel,
  type = "text",
}: Props): React.ReactElement {
  const datalistId = `${listId}-datalist`;
  return (
    <>
      <input
        type={type}
        list={datalistId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        aria-label={ariaLabel}
      />
      <datalist id={datalistId}>
        {options.map((opt, i) => (
          <option key={opt || i} value={opt} />
        ))}
      </datalist>
    </>
  );
}
