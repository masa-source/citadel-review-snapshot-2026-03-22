/**
 * マスタCRUDのデータソースを抽象化する型。
 * Admin は API、Scout はリポジトリをラップして渡す。
 */

export interface MasterCrudAdapter<T> {
  list: T[];
  isLoading?: boolean;
  error?: string | null;
  create(payload: Partial<T>): Promise<void>;
  update(id: string, payload: Partial<T>): Promise<void>;
  delete(id: string): Promise<void>;
  refetch?(): void;
}
