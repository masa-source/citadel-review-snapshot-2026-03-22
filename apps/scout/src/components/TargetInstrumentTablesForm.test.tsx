import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TargetInstrumentTablesForm } from "./TargetInstrumentTablesForm";

const mockTitRepo = {
  getByTargetInstrumentId: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  reorderSortOrder: vi.fn(),
  swapSortOrder: vi.fn(),
};

const mockTdRepo = {
  list: vi.fn(),
};

vi.mock("@/services/data", () => ({
  getRepository: (key: string) => {
    if (key === "targetInstrumentTables") return mockTitRepo;
    if (key === "tableDefinitions") return mockTdRepo;
    throw new Error(`unexpected repository key: ${key}`);
  },
}));

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (querier: () => unknown) => querier(),
}));

vi.mock("@/utils/uuid", () => ({
  generateUUID: () => "uuid-1",
}));

describe("TargetInstrumentTablesForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // useLiveQuery を単純に querier() の戻り値として扱うモックなので、ここは Promise ではなく同期値を返す
    mockTitRepo.getByTargetInstrumentId.mockReturnValue([
      {
        id: "table-1",
        targetInstrumentId: "ti-1",
        reportId: "r-1",
        tableDefinitionId: "td-1",
        roleKey: "",
        sortOrder: 0,
        rows: [{ a: "0.05" }],
      },
    ]);
    mockTdRepo.list.mockReturnValue([
      {
        id: "td-1",
        name: "TD",
        columns: [{ key: "a", name: "A" }],
      },
    ]);
  });

  it("onChange では DB update せず、onBlur で update する", async () => {
    const { findByText, findByDisplayValue } = render(
      <TargetInstrumentTablesForm targetInstrumentId="ti-1" reportId="r-1" />
    );

    // まずテーブルを展開
    const header = await findByText("TD");
    fireEvent.click(header);

    const input = await findByDisplayValue("0.05");
    fireEvent.change(input, { target: { value: "0.056" } });

    expect(mockTitRepo.update).not.toHaveBeenCalled();

    fireEvent.blur(input);

    expect(mockTitRepo.update).toHaveBeenCalledTimes(1);
    expect(mockTitRepo.update).toHaveBeenCalledWith("table-1", {
      rows: [{ a: "0.056" }],
    });
  });
});
