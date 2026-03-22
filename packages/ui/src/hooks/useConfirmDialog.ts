import { useCallback, useRef, useState } from "react";

export interface ConfirmOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" のとき確認ボタンを赤系にする */
  variant?: "default" | "danger";
}

export interface UseConfirmDialogResult {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  onOpenChange: (open: boolean) => void;
  /** 確認ダイアログを表示し、ユーザーが「確認」なら true、「キャンセル」なら false で resolve する Promise を返す */
  ask: (options: ConfirmOptions) => Promise<boolean>;
}

export function useConfirmDialog(): UseConfirmDialogResult {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [confirmLabel, setConfirmLabel] = useState("確認");
  const [cancelLabel, setCancelLabel] = useState("キャンセル");
  const [variant, setVariant] = useState<"default" | "danger">("default");
  const resolveRef = useRef<{ resolve: ((value: boolean) => void) | null }>({
    resolve: null,
  });

  const ask = useCallback((options: ConfirmOptions): Promise<boolean> => {
    setTitle(options.title ?? "確認");
    setDescription(options.description);
    setConfirmLabel(options.confirmLabel ?? "確認");
    setCancelLabel(options.cancelLabel ?? "キャンセル");
    setVariant(options.variant ?? "default");
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current.resolve = resolve;
    });
  }, []);

  const finish = useCallback((value: boolean) => {
    setOpen(false);
    resolveRef.current.resolve?.(value);
    resolveRef.current.resolve = null;
  }, []);

  const onConfirm = useCallback(() => finish(true), [finish]);
  const onCancel = useCallback(() => finish(false), [finish]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next) finish(false);
      setOpen(next);
    },
    [finish]
  );

  return {
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    variant,
    onConfirm,
    onCancel,
    onOpenChange,
    ask,
  };
}
