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

  it.each([
    "发言人\n00:00 你好",
    "发言人 1 · 00:00\n你好",
    "Speaker 1 | 00:00\nHello",
    "面试官：介绍一下你自己",
    "你好，欢迎参加今天的面试",
    "Q: 为什么选择我们？",
  ])("does not use transcript content as company: %s", (raw) => {
    expect(inferInterviewInput(raw)).toMatchObject({ company: "未命名面试", role: "" });
  });

  it("reads explicitly labelled metadata without inventing names", () => {
    expect(inferInterviewInput("公司：示例科技\n岗位：产品经理\n轮次：二面\n日期：2026/8/3\n发言人 1")).toMatchObject({
      company: "示例科技", role: "产品经理", round: "二面", date: "2026-08-03",
    });
  });

  it("handles role, round and date in separate heading segments", () => {
    expect(inferInterviewInput("示例科技 | AI 产品经理 | 三面 | 2026.8.3\n面试原文")).toMatchObject({
      company: "示例科技", role: "AI 产品经理", round: "三面", date: "2026-08-03",
    });
  });
});
