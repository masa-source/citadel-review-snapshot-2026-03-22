import { useState, useMemo } from "react";
import { Copy, Check, MousePointer, Search, Star, EyeOff } from "lucide-react";
import { cn } from "@citadel/ui";
import {
  buildPlaceholderList,
  getPathBadges,
  getPathHint,
  isRecommendedPath,
  sortPlaceholderItemsByRecommendation,
  type PlaceholderListItem,
} from "@/features/drafting/utils/placeholderMatching";
import { TreeView } from "@/components/TreeView";
import { buildPlaceholderTree, getAncestorIdsFromPaths } from "@/utils/treeBuilders";

function copyToClipboard(text: string): void {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

interface PlaceholderListProps {
  data: unknown;
  onCopy?: (placeholder: string) => void;
  onInsert?: (placeholder: string) => void;
  filterKeyword?: string;
  onFilterChange?: (value: string) => void;
}

export function PlaceholderList({
  data,
  onCopy,
  onInsert,
  filterKeyword: filterKeywordProp,
  onFilterChange,
}: PlaceholderListProps) {
  const [internalFilter, setInternalFilter] = useState("");
  const filterKeyword = onFilterChange !== undefined ? (filterKeywordProp ?? "") : internalFilter;
  const setFilterKeyword = onFilterChange ?? setInternalFilter;

  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [hideEmpty, setHideEmpty] = useState(false);

  const fullList = useMemo(() => {
    if (data == null || typeof data !== "object" || Array.isArray(data)) return [];
    return buildPlaceholderList(data);
  }, [data]);

  const filteredList = useMemo(() => {
    const q = (filterKeyword ?? "").trim().toLowerCase();
    let list = fullList;
    if (q) {
      list = list.filter(
        (item) => item.path.toLowerCase().includes(q) || item.previewValue.toLowerCase().includes(q)
      );
    }
    if (hideEmpty) {
      list = list.filter((item) => {
        const v = item.previewValue;
        if (v === "null" || v === "undefined") return false;
        if (v.trim() === "") return false;
        return true;
      });
    }
    return list;
  }, [fullList, filterKeyword, hideEmpty]);

  const treeNodes = useMemo(
    () =>
      buildPlaceholderTree<PlaceholderListItem>(sortPlaceholderItemsByRecommendation(filteredList)),
    [filteredList]
  );

  const defaultOpenIds = useMemo(() => {
    const q = (filterKeyword ?? "").trim();
    if (!q || filteredList.length === 0) return new Set<string>();
    return getAncestorIdsFromPaths(filteredList.map((i) => i.path));
  }, [filterKeyword, filteredList]);

  const handleCopy = (path: string) => {
    const placeholder = `{{ ${path} }}`;
    copyToClipboard(placeholder);
    onCopy?.(placeholder);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  const handleInsert = (path: string) => {
    const placeholder = `{{ ${path} }}`;
    onInsert?.(placeholder);
  };

  return (
    <div className="font-mono text-sm bg-gray-50 rounded-lg overflow-hidden flex flex-col max-h-[600px]">
      <div className="p-2 border-b border-gray-200 bg-white shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="キー・値を検索..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              aria-label="プレースホルダ検索"
            />
          </div>
          <button
            type="button"
            onClick={() => setHideEmpty((prev) => !prev)}
            className={cn(
              "flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors",
              hideEmpty
                ? "bg-amber-100 border-amber-300 text-amber-800"
                : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400"
            )}
            title={hideEmpty ? "空の値を表示" : "空の値を隠す"}
            aria-label={hideEmpty ? "空の値を表示" : "空の値を隠す"}
            aria-pressed={hideEmpty}
          >
            <EyeOff className="w-3.5 h-3.5" />
            空の値を隠す
          </button>
        </div>
      </div>
      <div className="p-2 overflow-auto min-h-0 flex-1">
        {filteredList.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            {fullList.length === 0
              ? "表示できるプレースホルダがありません。"
              : "検索に一致する項目がありません。"}
          </div>
        ) : (
          <TreeView<PlaceholderListItem>
            key={`tree-${filterKeyword ?? ""}`}
            nodes={treeNodes}
            defaultOpenIds={defaultOpenIds}
            renderLeaf={(item) => {
              const badges = getPathBadges(item.path);
              const hint = getPathHint(item.path);
              const recommended = isRecommendedPath(item.path);
              return (
                <div
                  className={cn(
                    "group flex items-center gap-2 py-1 pr-2 transition-colors rounded",
                    recommended ? "bg-green-50/40 hover:bg-green-50/60" : "hover:bg-gray-50/80"
                  )}
                >
                  {recommended && (
                    <Star
                      className="w-3.5 h-3.5 shrink-0 text-amber-500 fill-amber-500"
                      aria-hidden
                    />
                  )}
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-gray-800" title={item.path}>
                        {item.path}
                      </span>
                      {hint && <span className="shrink-0 text-gray-400 text-xs">{hint}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {badges.map((b) => (
                        <span
                          key={b.type}
                          className={cn(
                            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                            b.type === "recommended" && "bg-green-100 text-green-800",
                            b.type === "ordered" && "bg-purple-100 text-purple-800",
                            b.type === "primary" && "bg-blue-100 text-blue-800"
                          )}
                        >
                          {b.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span
                    className="shrink-0 max-w-[100px] truncate text-gray-500 text-xs"
                    title={item.previewValue}
                  >
                    {item.previewValue}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-50 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleCopy(item.path)}
                      className={cn(
                        "p-1 rounded transition-colors",
                        copiedPath === item.path
                          ? "bg-green-100 text-green-700"
                          : "text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                      )}
                      title="コピー"
                      aria-label={`${item.path} をコピー`}
                    >
                      {copiedPath === item.path ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {onInsert && (
                      <button
                        type="button"
                        onClick={() => handleInsert(item.path)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-amber-600 hover:bg-amber-100 transition-colors"
                        title="選択セルに挿入"
                        aria-label="挿入"
                        data-testid="placeholder-insert"
                      >
                        <MousePointer className="w-3.5 h-3.5" />
                        挿入
                      </button>
                    )}
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
