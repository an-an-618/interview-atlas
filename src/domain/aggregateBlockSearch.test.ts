import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "../data/demo";
import { searchSyncBlocks } from "./workspace";

describe("aggregate block search", () => {
  const blocks = () => {
    const [sample] = createDemoWorkspace().syncBlocks;
    return [
      {
        ...sample!,
        id: "project",
        title: "项目复盘",
        body: "STAR framework",
        reviewNotes: "补充量化指标",
      },
      {
        ...sample!,
        id: "research",
        title: "用户研究",
        body: "先定义目标再补充指标",
        reviewNotes: "",
      },
    ];
  };

  it("matches all keywords across title, answer and review notes", () => {
    expect(searchSyncBlocks(blocks(), "指标 项目 star").map((block) => block.id))
      .toEqual(["project"]);
    expect(searchSyncBlocks(blocks(), "项目 不存在")).toEqual([]);
  });

  it("normalizes full-width characters, case and repeated whitespace", () => {
    const source = blocks();
    source[0]!.body = "ＳＴＡＲ　Ｆｒａｍｅｗｏｒｋ";
    expect(searchSyncBlocks(source, "  star\tFRAMEWORK\n复盘  ").map((block) => block.id))
      .toEqual(["project"]);
    expect(searchSyncBlocks(blocks(), "ＳＴＡＲ").map((block) => block.id))
      .toEqual(["project"]);
  });

  it("preserves result order and source data", () => {
    const source = blocks();
    const original = structuredClone(source);
    expect(searchSyncBlocks(source, "指标 指标").map((block) => block.id))
      .toEqual(["project", "research"]);
    expect(source).toEqual(original);
    expect(searchSyncBlocks(source, " \t\n　")).toBe(source);
  });
});
