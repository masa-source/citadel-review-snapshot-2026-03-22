import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toast 通知コンポーネント
 *
 * 使用例:
 * ```tsx
 * import { toast } from "sonner";
 *
 * // 成功
 * toast.success("保存しました");
 *
 * // エラー
 * toast.error("エラーが発生しました");
 *
 * // 情報
 * toast.info("処理中...");
 *
 * // Promise
 * toast.promise(asyncFunction(), {
 *   loading: "処理中...",
 *   success: "完了しました",
 *   error: "エラーが発生しました",
 * });
 * ```
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
