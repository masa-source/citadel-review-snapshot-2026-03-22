import { useState, useCallback } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, File } from "lucide-react";
import { cn } from "@citadel/ui";

export interface TreeNode<T> {
  id: string;
  label: string;
  /** フォルダ配下のリーフ（末端）の合計数。フォルダノードのみ設定。 */
  leafCount?: number;
  children?: TreeNode<T>[];
  data?: T;
}

interface TreeViewProps<T> {
  nodes: TreeNode<T>[];
  renderLeaf: (data: T) => React.ReactNode;
  /** 渡すと controlled として扱う。onOpenChange で親が開閉状態を更新する。 */
  openIds?: Set<string>;
  /** openIds を渡した場合は必須。開閉時に呼ばれる。 */
  onOpenChange?: (openIds: Set<string>) => void;
  /** uncontrolled 時の初期開閉状態。openIds を渡さない場合にのみ使う。 */
  defaultOpenIds?: Set<string>;
  /** フォルダノードの data-testid を返す関数。指定時はボタンに付与。 */
  getFolderTestId?: (node: TreeNode<T>) => string | undefined;
}

function TreeViewInner<T>({
  nodes,
  renderLeaf,
  depth,
  openIds,
  setOpenIds,
  getFolderTestId,
}: {
  nodes: TreeNode<T>[];
  renderLeaf: (data: T) => React.ReactNode;
  depth: number;
  openIds: Set<string>;
  setOpenIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  getFolderTestId?: (node: TreeNode<T>) => string | undefined;
}) {
  const toggle = useCallback(
    (id: string) => {
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [setOpenIds]
  );

  return (
    <>
      {nodes.map((node) => {
        const isLeaf = node.data !== undefined;
        const isOpen = openIds.has(node.id);
        const indent = depth * 16;

        if (isLeaf && node.data !== undefined) {
          return (
            <div
              key={node.id}
              className="flex items-center gap-2 py-1.5 pr-2 transition-colors hover:bg-gray-50"
              style={{ paddingLeft: indent + 8 }}
            >
              <span className="flex w-5 shrink-0" aria-hidden>
                <File className="w-4 h-4 text-gray-400" />
              </span>
              <div className="flex-1 min-w-0">{renderLeaf(node.data)}</div>
            </div>
          );
        }

        return (
          <div key={node.id}>
            <button
              type="button"
              onClick={() => toggle(node.id)}
              className={cn(
                "flex items-center gap-2 w-full py-1.5 pr-2 text-left text-sm transition-colors",
                "hover:bg-gray-100 rounded"
              )}
              style={{ paddingLeft: indent + 8 }}
              aria-expanded={isOpen}
              data-testid={getFolderTestId?.(node)}
            >
              {isOpen ? (
                <ChevronDown className="w-4 h-4 shrink-0 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0 text-gray-500" />
              )}
              {isOpen ? (
                <FolderOpen className="w-4 h-4 shrink-0 text-amber-600" />
              ) : (
                <Folder className="w-4 h-4 shrink-0 text-amber-600" />
              )}
              <span className="font-medium text-gray-800 truncate">{node.label}</span>
              {node.leafCount !== undefined && (
                <span className="text-xs text-gray-500 ml-2 shrink-0">({node.leafCount})</span>
              )}
            </button>
            {isOpen && node.children && node.children.length > 0 && (
              <TreeViewInner
                nodes={node.children}
                renderLeaf={renderLeaf}
                depth={depth + 1}
                openIds={openIds}
                setOpenIds={setOpenIds}
                getFolderTestId={getFolderTestId}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export function TreeView<T>({
  nodes,
  renderLeaf,
  openIds: controlledOpenIds,
  onOpenChange,
  defaultOpenIds,
  getFolderTestId,
}: TreeViewProps<T>) {
  const [internalOpenIds, setInternalOpenIds] = useState<Set<string>>(defaultOpenIds ?? new Set());

  const isControlled = controlledOpenIds !== undefined;
  const openIds = isControlled ? controlledOpenIds : internalOpenIds;

  const setOpenIds = useCallback(
    (updater: React.SetStateAction<Set<string>>) => {
      const next = typeof updater === "function" ? updater(openIds) : updater;
      onOpenChange?.(next);
      if (!isControlled) setInternalOpenIds(next);
    },
    [onOpenChange, isControlled, openIds]
  );

  return (
    <div className="py-1">
      <TreeViewInner
        nodes={nodes}
        renderLeaf={renderLeaf}
        depth={0}
        openIds={openIds}
        setOpenIds={setOpenIds}
        getFolderTestId={getFolderTestId}
      />
    </div>
  );
}
