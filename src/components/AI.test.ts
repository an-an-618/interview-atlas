import { describe, expect, it } from "vitest";
import { inferInterviewInput } from "./AI";

describe("interview import metadata", () => {
  it("infers metadata from the prototype-style first line", () => {
    const input = inferInterviewInput(
      "字节跳动 · 前端二面 · 2026-09-24 · 60min\n1. React Fiber 是什么？",
    );

    expect(input).toMatchObject({
      company: "字节跳动",
      role: "前端",
      round: "二面",
      date: "2026-09-24",
      source: "粘贴导入",
    });
  });

  it("keeps question-only text as an unnamed interview", () => {
    const input = inferInterviewInput("1. 如何定位线上问题？\n2. 如何复盘？");

    expect(input.company).toBe("未命名面试");
    expect(input.role).toBe("");
    expect(input.rawText).toContain("如何定位线上问题");
  });
});
