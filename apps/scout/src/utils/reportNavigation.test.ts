import { describe, it, expect } from "vitest";
import { getReportEditPath } from "./reportNavigation";

describe("getReportEditPath", () => {
  it("一覧から編集を開くときは id と mode を含む完全遷移用 URL を返す（閲覧）", () => {
    const reportId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(getReportEditPath(reportId, "view")).toBe(
      "/reports/edit?id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&mode=view"
    );
  });

  it("一覧から編集を開くときは id と mode を含む完全遷移用 URL を返す（編集）", () => {
    const reportId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(getReportEditPath(reportId, "edit")).toBe(
      "/reports/edit?id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&mode=edit"
    );
  });
});
