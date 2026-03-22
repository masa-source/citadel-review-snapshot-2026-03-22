import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind CSS クラス名をマージするユーティリティ関数
 *
 * clsx で条件付きクラスを処理し、tailwind-merge で重複を解決します。
 *
 * @example
 * cn("px-2 py-1", "px-4") // => "py-1 px-4"
 * cn("text-red-500", isActive && "text-blue-500") // 条件付きクラス
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
