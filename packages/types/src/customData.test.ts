import { describe, it, expect } from "vitest";
import { parseCustomData } from "./customData";

describe("parseCustomData", () => {
  it("null を渡すと空オブジェクトを返す", () => {
    expect(parseCustomData(null)).toEqual({});
  });

  it("undefined を渡すと空オブジェクトを返す", () => {
    expect(parseCustomData(undefined)).toEqual({});
  });

  it("空配列を渡すと空オブジェクトを返す", () => {
    expect(parseCustomData([])).toEqual({});
  });

  it("文字列を渡すと空オブジェクトを返す", () => {
    expect(parseCustomData("string")).toEqual({});
    expect(parseCustomData("")).toEqual({});
  });

  it("数値を渡すと空オブジェクトを返す", () => {
    expect(parseCustomData(0)).toEqual({});
    expect(parseCustomData(1)).toEqual({});
  });

  it("真偽値を渡すと空オブジェクトを返す", () => {
    expect(parseCustomData(true)).toEqual({});
    expect(parseCustomData(false)).toEqual({});
  });

  it("空オブジェクトを渡すとそのまま返す", () => {
    const empty = {};
    expect(parseCustomData(empty)).toBe(empty);
    expect(parseCustomData({})).toEqual({});
  });

  it("通常のオブジェクトを渡すとそのまま返す", () => {
    const obj = { a: 1, b: "x", c: null };
    expect(parseCustomData(obj)).toEqual(obj);
  });

  it("ネストしたオブジェクトをそのまま返す", () => {
    const nested = { a: { b: 2 } };
    expect(parseCustomData(nested)).toEqual(nested);
  });
});
