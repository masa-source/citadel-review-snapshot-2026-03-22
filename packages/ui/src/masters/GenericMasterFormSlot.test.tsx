// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GenericMasterFormSlot } from "./GenericMasterFormSlot";
import { MasterFormActions } from "./MasterFormActions";

// ui側でダミーのマスタとして扱う
const dummySchema = {
  type: "object",
  properties: { name: { type: "string" } },
};

describe("GenericMasterFormSlot", () => {
  it("編集モードで初期値が正しくレンダリングされ、保存時に呼び出されること", async () => {
    const handleSave = vi.fn();
    const handleCancel = vi.fn();

    const { container } = render(
      <GenericMasterFormSlot
        mode="edit"
        item={{ id: "1", name: "Initial Name" }}
        onSave={handleSave}
        onCancel={handleCancel}
        saving={false}
        metadata={{ schema: dummySchema as any, columns: [] }}
        emptyData={{ name: "" }}
      />
    );

    // フォーム内の Input に Initial Name が入っていることを確認
    const input = container.querySelector("#root_name") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("Initial Name");

    // 値を変更して保存するテスト
    fireEvent.change(input, { target: { value: "Updated Name" } });

    // Saveボタンを押下
    const saveButtons = screen.getAllByRole("button", { name: "保存" });
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      // Editモードの場合、保存時に元のidが含まれた状態で呼ばれる実装を期待
      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Updated Name", id: "1" })
      );
    });
  });

  it("キャンセルボタン押下時に onCancel が呼ばれること", () => {
    const handleCancel = vi.fn();
    render(
      <GenericMasterFormSlot
        mode="create"
        item={null}
        onSave={vi.fn()}
        saving={false}
        onCancel={handleCancel}
        metadata={{ schema: dummySchema as any, columns: [] }}
        emptyData={{ name: "" }}
      />
    );

    const cancelButtons = screen.getAllByRole("button", { name: "キャンセル" });
    // 新しくレンダリングしたコンテナ内のボタンを押す
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);
    expect(handleCancel).toHaveBeenCalled();
  });
});
