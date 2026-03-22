/**
 * 簡易設計台（Drafting）で使う型と定数。
 */

export interface MatchItem {
  row: number;
  col: number;
  currentValue: string;
  placeholder: string;
}

export interface MergeCellRange {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

export interface ColMetadata {
  hidden?: boolean;
  width?: number;
}

export interface SheetData {
  name: string;
  data: (string | number | null)[][];
  mergeCells?: MergeCellRange[];
  col_metadata?: ColMetadata[];
}

export interface GridResponse {
  sheets: SheetData[];
  sheetNameMismatch?: boolean;
  storedSheetNames?: string[];
  currentSheetNames?: string[];
}

export interface GridChange {
  sheetName: string;
  row: number;
  col: number;
  value: string | number | null;
}

export type RowArray = (string | number | null)[];

export type LayoutMode = "split" | "grid" | "tree";
export type EditMode = "internal" | "external";
