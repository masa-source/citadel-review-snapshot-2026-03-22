/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGenericScoutMasterConfig } from "./useGenericScoutMasterConfig";
import { MASTER_METADATA } from "@citadel/ui";

// Dexie のモック
const mockRepoAdd = vi.fn();
const mockRepoUpdate = vi.fn();
const mockRepoRemove = vi.fn();
const mockRepoList = vi.fn();

vi.mock("@/services/data", () => ({
  getRepository: () => ({
    add: mockRepoAdd,
    update: mockRepoUpdate,
    remove: mockRepoRemove,
    list: mockRepoList,
  }),
}));

// dexie-react-hooks の useLiveQuery のモック
vi.mock("dexie-react-hooks", () => ({
  // 単純に list 関数（Promsie）の解決結果を返すようにエミュレートする
  // 実際は useEffect で監視されるが、テストでは同等の結果を直で返す
  useLiveQuery: (querier: any, deps: any) => {
    // querier() は repo.list() を呼び出す想定
    // テスト側で mockRepoList.mockResolvedValue を設定し、ここでは仮の同期値を返す
    // 複雑な状態管理を避けるため簡易モデルとする
    return [
      { id: "1", name: "Company A" },
      { id: "2", name: "Company B" },
    ];
  },
}));

// uuidのモック
vi.mock("@/utils/uuid", () => ({
  generateUUID: () => "mock-uuid-999",
}));

describe("useGenericScoutMasterConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepoList.mockResolvedValue([
      { id: "1", name: "Company A" },
      { id: "2", name: "Company B" },
    ]);
  });

  it("初期状態でリストを取得できること", () => {
    const { result } = renderHook(() =>
      useGenericScoutMasterConfig({
        entityKey: "companies",
        metadata: MASTER_METADATA["companies"],
        title: "会社マスタ",
        listTitle: "会社一覧",
        emptyMessage: "データがありません",
      })
    );

    // useLiveQuery のモックが返す値
    expect(result.current.list!).toHaveLength(2);
    expect(result.current.list![0].name).toBe("Company A");
  });

  it("create メソッドで Repo の add を呼び出すこと", async () => {
    const { result } = renderHook(() =>
      useGenericScoutMasterConfig({
        entityKey: "companies",
        metadata: MASTER_METADATA["companies"],
        title: "会社マスタ",
      })
    );

    await act(async () => {
      await result.current.create({ name: "New Company" } as any);
    });

    expect(mockRepoAdd).toHaveBeenCalledWith({
      name: "New Company",
      id: "mock-uuid-999",
    });
  });

  it("update メソッドで Repo の update を呼び出すこと", async () => {
    const { result } = renderHook(() =>
      useGenericScoutMasterConfig({
        entityKey: "companies",
        metadata: MASTER_METADATA["companies"],
        title: "会社マスタ",
      })
    );

    await act(async () => {
      await result.current.update("1", { name: "Updated Company" } as any);
    });

    expect(mockRepoUpdate).toHaveBeenCalledWith("1", { name: "Updated Company" });
  });

  it("delete メソッドで Repo の remove を呼び出すこと", async () => {
    const { result } = renderHook(() =>
      useGenericScoutMasterConfig({
        entityKey: "companies",
        metadata: MASTER_METADATA["companies"],
        title: "会社マスタ",
      })
    );

    await act(async () => {
      await result.current.delete("1");
    });

    expect(mockRepoRemove).toHaveBeenCalledWith("1");
  });
});
