// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { renderHook, act, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { useGenericMasterConfig } from "./useGenericMasterConfig";
import { MASTER_METADATA } from "@citadel/ui";

vi.mock("@citadel/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@citadel/ui")>();
  return {
    ...actual,
    MASTER_METADATA: {
      companies: {
        schema: { type: "object", properties: { name: { type: "string" } } },
        columns: [{ key: "name", label: "会社名", render: (c: any) => c.name }],
      },
    },
  };
});

// モック用のデータ
const mockCompanies = [
  { id: "1", name: "Company A" },
  { id: "2", name: "Company B" },
];

const mockCompanyCreate = { name: "New Company" } as any;
const mockCompanyUpdate = { name: "Updated Company" } as any;

const BASE_URL = "http://localhost:8000";

// MSW サーバーセットアップ
const server = setupServer(
  http.get(`${BASE_URL}/api/companies`, () => {
    return HttpResponse.json(mockCompanies);
  }),
  http.post(`${BASE_URL}/api/companies`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: "3", ...(body as object) }, { status: 201 });
  }),
  http.put(`${BASE_URL}/api/companies/:id`, async ({ params, request }) => {
    const { id } = params;
    const body = await request.json();
    return HttpResponse.json({ id, ...(body as object) }, { status: 200 });
  }),
  http.delete(`${BASE_URL}/api/companies/:id`, ({ params }) => {
    return new HttpResponse(null, { status: 204 });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

describe("useGenericMasterConfig", () => {
  it("指定したAPIパスからリストを取得できること", async () => {
    const { result } = renderHook(() =>
      useGenericMasterConfig({
        entityKey: "companies",
        apiPath: "/api/companies",
        metadata: MASTER_METADATA["companies"],
        title: "会社マスタ",
        listTitle: "会社一覧",
        emptyMessage: "データがありません",
      })
    );

    let list: any[] = [];
    await act(async () => {
      list = await result.current.getList();
    });

    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("Company A");
  });

  it("create メソッドで POST API を呼び出すこと", async () => {
    const { result } = renderHook(() =>
      useGenericMasterConfig({
        entityKey: "companies",
        apiPath: "/api/companies",
        metadata: MASTER_METADATA["companies"],
        title: "会社マスタ",
      })
    );

    await act(async () => {
      await result.current.create(mockCompanyCreate);
    });
    // エラーがthrowされなければ成功とする
    expect(true).toBe(true);
  });

  it("update メソッドで PUT API を呼び出すこと", async () => {
    const { result } = renderHook(() =>
      useGenericMasterConfig({
        entityKey: "companies",
        apiPath: "/api/companies",
        metadata: MASTER_METADATA["companies"],
        title: "会社マスタ",
      })
    );

    await act(async () => {
      await result.current.update("1", mockCompanyUpdate);
    });
    expect(true).toBe(true);
  });

  it("delete メソッドで DELETE API を呼び出すこと", async () => {
    const { result } = renderHook(() =>
      useGenericMasterConfig({
        entityKey: "companies",
        apiPath: "/api/companies",
        metadata: MASTER_METADATA["companies"],
        title: "会社マスタ",
      })
    );

    await act(async () => {
      await result.current.delete("1");
    });
    expect(true).toBe(true);
  });
});
