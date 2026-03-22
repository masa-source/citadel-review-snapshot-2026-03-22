import type { TreeNode } from "@/components/TreeView";

/** file_path を "/" で分割したセグメント配列（先頭〜最後がフォルダ、最後がファイル名） */
function splitFilePath(filePath: string): string[] {
  return filePath.split("/").filter(Boolean);
}

/** path を "." で分割するが、key[0] や key['id'] は1セグメントとして扱う */
export function splitPlaceholderPath(path: string): string[] {
  const segments = path.match(/[^.[\]]+(\[[^\]]*\])?/g);
  return segments ?? [path];
}

/** 複数 path から、リーフ以外の全祖先ノード id を集めた Set（検索時などに自動展開用） */
export function getAncestorIdsFromPaths(paths: string[]): Set<string> {
  const ids = new Set<string>();
  for (const path of paths) {
    const segments = splitPlaceholderPath(path);
    let prefix = "";
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const id = prefix ? `${prefix}.${seg}` : seg;
      prefix = id;
      ids.add(id);
    }
  }
  return ids;
}

/** フォルダノードに leafCount を再帰的に埋める。リーフはカウント1、フォルダは子の合計。 */
function fillLeafCount<T>(node: TreeNode<T>): number {
  if (node.data !== undefined) return 1;
  let count = 0;
  if (node.children) {
    for (const child of node.children) {
      count += fillLeafCount(child);
    }
  }
  node.leafCount = count;
  return count;
}

export interface TemplateLike {
  id: string;
  name: string;
  filePath: string;
  fileExists?: boolean;
}

/**
 * テンプレートの file_path を "/" で階層化し、ツリーを構築する。
 * 各フォルダノードに leafCount を設定する。
 */
export function buildTemplateTree<T extends TemplateLike>(templates: T[]): TreeNode<T>[] {
  const root = new Map<string, TreeNode<T>>();

  for (const t of templates) {
    const segments = splitFilePath(t.filePath);
    if (segments.length === 0) continue;
    let prefix = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      const id = prefix ? `${prefix}/${seg}` : seg;
      const parentId = i > 0 ? segments.slice(0, i).join("/") : "";
      prefix = id;

      if (isLast) {
        const parent = parentId ? root.get(parentId) : null;
        const leaf: TreeNode<T> = { id, label: seg, data: t };
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(leaf);
        } else {
          if (!root.has(id)) root.set(id, leaf);
          else {
            const existing = root.get(id)!;
            if (!existing.children) existing.children = [];
            existing.children.push(leaf);
          }
        }
      } else {
        if (!root.has(id)) {
          const folder: TreeNode<T> = { id, label: seg, children: [] };
          root.set(id, folder);
          if (parentId) {
            const parent = root.get(parentId);
            if (parent && parent.children) parent.children.push(folder);
          }
        }
      }
    }
  }

  const roots: TreeNode<T>[] = [];
  const seen = new Set<string>();
  for (const t of templates) {
    const segments = splitFilePath(t.filePath);
    if (segments.length === 0) continue;
    const first = segments[0];
    if (!seen.has(first)) {
      seen.add(first);
      const node = root.get(first);
      if (node) roots.push(node);
    }
  }
  roots.sort((a, b) => a.label.localeCompare(b.label));

  for (const node of roots) {
    fillLeafCount(node);
  }
  return roots;
}

export interface PlaceholderListItemLike {
  path: string;
  previewValue: string;
  category?: string;
}

/**
 * プレースホルダの path を "." / "[]" で階層化し、ツリーを構築する。
 * filteredList から呼べば、検索後の要素数が leafCount に反映される。
 */
export function buildPlaceholderTree<T extends PlaceholderListItemLike>(items: T[]): TreeNode<T>[] {
  const root = new Map<string, TreeNode<T>>();

  for (const item of items) {
    const segments = splitPlaceholderPath(item.path);
    if (segments.length === 0) continue;
    let prefix = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      const id = prefix ? `${prefix}.${seg}` : seg;
      const parentId = i > 0 ? segments.slice(0, i).join(".") : "";
      prefix = id;

      if (isLast) {
        const parent = parentId ? root.get(parentId) : null;
        const leaf: TreeNode<T> = { id, label: seg, data: item };
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(leaf);
        } else {
          if (!root.has(id)) root.set(id, leaf);
          else {
            const existing = root.get(id)!;
            if (!existing.children) existing.children = [];
            existing.children.push(leaf);
          }
        }
      } else {
        if (!root.has(id)) {
          const folder: TreeNode<T> = { id, label: seg, children: [] };
          root.set(id, folder);
          if (parentId) {
            const parent = root.get(parentId);
            if (parent && parent.children) parent.children.push(folder);
          }
        }
      }
    }
  }

  const roots: TreeNode<T>[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const segments = splitPlaceholderPath(item.path);
    if (segments.length === 0) continue;
    const first = segments[0];
    if (!seen.has(first)) {
      seen.add(first);
      const node = root.get(first);
      if (node) roots.push(node);
    }
  }
  roots.sort((a, b) => a.label.localeCompare(b.label));

  for (const node of roots) {
    fillLeafCount(node);
  }
  return roots;
}
