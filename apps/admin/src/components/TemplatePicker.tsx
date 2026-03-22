import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, File, AlertCircle, X } from "lucide-react";
import { cn } from "@citadel/ui";
import { TreeView } from "@/components/TreeView";
import { buildTemplateTree } from "@/utils/treeBuilders";
import type { TemplateItem } from "@/utils/api";

interface TemplatePickerProps {
  templates: TemplateItem[];
  value: string;
  onChange: (templateId: string) => void;
  disabled?: boolean;
}

export function TemplatePicker({
  templates,
  value,
  onChange,
  disabled = false,
}: TemplatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelPosition, setPanelPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // 選択済みテンプレートの情報を取得
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === value) ?? null,
    [templates, value]
  );

  // 検索でフィルタリング
  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) => t.name?.toLowerCase().includes(q) || t.filePath?.toLowerCase().includes(q)
    );
  }, [templates, search]);

  // フィルタ済みリストからツリーを構築
  const treeNodes = useMemo(
    () => buildTemplateTree<TemplateItem>(filteredTemplates),
    [filteredTemplates]
  );

  // 検索中はマッチしたリーフの祖先フォルダを自動展開
  const autoOpenIds = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    const paths = filteredTemplates.map((t) => t.filePath ?? "");
    // ファイルパスのセグメント区切りは "/" なので、祖先IDをスラッシュ区切りで構築
    const ids = new Set<string>();
    for (const path of paths) {
      const segments = path.split("/").filter(Boolean);
      let prefix = "";
      for (let i = 0; i < segments.length - 1; i++) {
        prefix = prefix ? `${prefix}/${segments[i]}` : segments[i];
        ids.add(prefix);
      }
    }
    return ids;
  }, [filteredTemplates, search]);

  // 検索中は自動展開を優先（controlled）、非検索中はピッカー内で開閉操作
  const [manualOpenIds, setManualOpenIds] = useState<Set<string>>(new Set());
  const openIds = search.trim() ? autoOpenIds : manualOpenIds;
  const handleOpenChange = useCallback(
    (next: Set<string>) => {
      if (!search.trim()) setManualOpenIds(next);
    },
    [search]
  );

  const toggleOpen = () => {
    if (disabled) return;
    const next = !isOpen;
    setIsOpen(next);
    if (!next) setSearch("");
  };

  // ドロップダウンの位置を計算（ビューポート基準）
  const updatePanelPosition = useCallback(() => {
    if (!isOpen) return;
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportPadding = 8;

    const spaceAbove = rect.top - viewportPadding;
    const spaceBelow = viewportHeight - rect.bottom - viewportPadding;

    // 検索バー + フッターなどの固定分
    const chromeHeight = 80;
    const minBodyHeight = 160;

    let top = 0;
    let maxHeight = 0;

    // 下側優先だが、はみ出す場合は上側に開く
    if (spaceBelow >= spaceAbove) {
      top = rect.bottom + 4;
      maxHeight = Math.max(minBodyHeight, spaceBelow - chromeHeight);
    } else {
      // 上側に開く場合は、パネル全体の高さを spaceAbove 以内に収める
      const totalMaxHeight = Math.max(minBodyHeight + chromeHeight, spaceAbove);
      maxHeight = totalMaxHeight - chromeHeight;
      const panelHeight = maxHeight + chromeHeight;
      top = rect.top - 4 - panelHeight;
      if (top < viewportPadding) {
        top = viewportPadding;
      }
    }

    const left = rect.left;
    const width = Math.max(rect.width, 288); // w-72 相当を下限とする

    setPanelPosition({ top, left, width, maxHeight });
  }, [isOpen]);

  // ピッカーを開いたときに検索フィールドにフォーカス
  useEffect(() => {
    if (isOpen) {
      updatePanelPosition();

      const handleResize = () => {
        updatePanelPosition();
      };
      window.addEventListener("resize", handleResize);
      window.addEventListener("scroll", handleResize, true);

      // 少し遅らせてアニメーション後にフォーカス
      const timer = setTimeout(() => searchRef.current?.focus(), 50);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("scroll", handleResize, true);
      };
    }
  }, [isOpen, updatePanelPosition]);

  // ピッカー外クリックで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = containerRef.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (inContainer || inPanel) return;
      setIsOpen(false);
      setSearch("");
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  // Escape キーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSelect = (template: TemplateItem) => {
    onChange(template.id);
    setIsOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative">
      {/* トリガーボタン */}
      <button
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors text-left",
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
            : "border-gray-300 bg-white hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500",
          isOpen && "border-amber-500 ring-2 ring-amber-500"
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          {selectedTemplate ? (
            <>
              <File className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span className="truncate text-gray-900">
                {selectedTemplate.name || selectedTemplate.filePath || selectedTemplate.id}
              </span>
              {!selectedTemplate.fileExists && (
                <AlertCircle
                  className="w-3.5 h-3.5 shrink-0 text-amber-500"
                  aria-label="物理ファイルが存在しません"
                />
              )}
            </>
          ) : (
            <span className="text-gray-400">選択してください</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 text-gray-400 transition-transform duration-150",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* ドロップダウンパネル（ポータル） */}
      {isOpen &&
        panelPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-50"
            style={{
              top: panelPosition.top,
              left: panelPosition.left,
              width: panelPosition.width,
            }}
            role="listbox"
            aria-label="テンプレート選択"
          >
            <div className="rounded-lg border border-gray-200 bg-white shadow-lg flex flex-col overflow-hidden">
              {/* 検索フィールド */}
              <div className="border-b border-gray-100 px-2 py-2">
                <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
                  <Search className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="名前・パスで検索..."
                    className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="shrink-0 text-gray-400 hover:text-gray-600"
                      aria-label="検索をクリア"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* ツリー本体 */}
              <div
                className="overflow-y-auto overscroll-contain"
                style={{ maxHeight: panelPosition.maxHeight }}
              >
                {treeNodes.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-gray-500">
                    {search ? "一致するテンプレートがありません" : "テンプレートがありません"}
                  </div>
                ) : (
                  <TreeView<TemplateItem>
                    nodes={treeNodes}
                    openIds={openIds}
                    onOpenChange={handleOpenChange}
                    renderLeaf={(template) => (
                      <button
                        type="button"
                        onClick={() => handleSelect(template)}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm transition-colors",
                          template.id === value
                            ? "bg-amber-100 text-amber-900 font-medium"
                            : "text-gray-800 hover:bg-amber-50"
                        )}
                        role="option"
                        aria-selected={template.id === value}
                      >
                        <span
                          className={cn(
                            "truncate flex-1",
                            !template.fileExists && "text-amber-700"
                          )}
                          title={template.filePath}
                        >
                          {template.name || template.filePath || template.id}
                        </span>
                        {!template.fileExists && (
                          <AlertCircle
                            className="w-3.5 h-3.5 shrink-0 text-amber-500"
                            aria-label="物理ファイルが存在しません"
                          />
                        )}
                        {template.id === value && (
                          <span className="shrink-0 text-xs text-amber-600">✓</span>
                        )}
                      </button>
                    )}
                  />
                )}
              </div>

              {/* 選択解除のフッター（選択済みのときのみ表示） */}
              {value && (
                <div className="border-t border-gray-100 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onChange("");
                      setIsOpen(false);
                    }}
                    className="w-full rounded px-2 py-1 text-left text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    選択を解除する
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
