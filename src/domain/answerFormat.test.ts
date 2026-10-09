import { describe, expect, it } from "vitest";
import {
  answerPoints,
  formatAnswer,
  migrateLegacyAnswer,
} from "./answerFormat";

describe("structured answer format", () => {
  it("stores one answer angle per line without visible list markers", () => {
    expect(formatAnswer("1. 先定义目标\n• 再验证结果\n\n- 最后复盘")).toBe(
      "先定义目标\n再验证结果\n最后复盘",
    );
    expect(answerPoints("先定义目标\n再验证结果")).toEqual([
      "先定义目标",
      "再验证结果",
    ]);
  });

  it("keeps a short single-angle answer as one paragraph", () => {
    expect(migrateLegacyAnswer("我会先确认目标，再选择指标。")).toBe(
      "我会先确认目标，再选择指标。",
    );
  });

  it("reflows a long legacy paragraph without changing its content", () => {
    const legacy =
      "我先确认业务目标和用户范围，再明确成功指标。接着梳理现有链路，定位影响最大的环节，并保留关键约束。方案落地后会设计对照实验，观察转化率、留存和负向反馈。最后结合定量结果与用户访谈复盘，决定继续迭代还是回滚。";
    const migrated = migrateLegacyAnswer(legacy);

    expect(answerPoints(migrated).length).toBeGreaterThan(1);
    expect(migrated.replace(/\n/g, "")).toBe(legacy);
  });
});
