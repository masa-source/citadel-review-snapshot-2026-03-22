// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GenericDynamicForm } from "./GenericDynamicForm";

describe("GenericDynamicForm", () => {
  const schema = {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", title: "名前" },
      age: { type: "number", title: "年齢" },
    },
  };

  it("スキーマに基づいてフォームが正しくレンダリングされること", () => {
    render(<GenericDynamicForm schema={schema} />);
    // label が描画されているか (RJSF は label の外側に span 等をつけることがあるため正規表現で探す)
    expect(screen.getByText(/名前/)).toBeDefined();
    expect(screen.getByText(/年齢/)).toBeDefined();
  });

  it("値の変更時に onChange が呼ばれること", async () => {
    const handleChange = vi.fn();
    const { container } = render(<GenericDynamicForm schema={schema} onChange={handleChange} />);

    // RJSF のデフォルト id である #root_name を探す
    const nameInput = container.querySelector("#root_name") as HTMLInputElement;
    expect(nameInput).not.toBeNull();

    fireEvent.change(nameInput, { target: { value: "Test User" } });

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ name: "Test User" }));
    });
  });
});
