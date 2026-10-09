import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "../data/demo";
import { searchWorkspace } from "./globalSearch";

describe("global workspace search", () => {
  it("searches all knowledge asset types and ranks stronger matches first", () => {
    const workspace = createDemoWorkspace();
    workspace.questions.push({
      id: "content-match",
      title: "前端基础问题",
      answer: "回答中会解释事件循环。",
      notes: "",
      tags: [],
      sourceInterviewIds: [],
      linkedSyncBlockId: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });

    const results = searchWorkspace(workspace, "事件循环");

    expect(results.map((result) => result.id).slice(0, 3)).toEqual([
      "sample-sync",
      "sample-event-loop",
      "content-match",
    ]);
    expect(results.every((result) => result.score > 0)).toBe(true);
  });

  it("requires every query term while allowing terms to match different fields", () => {
    const results = searchWorkspace(
      createDemoWorkspace(),
      "星河 前端工程师",
    );

    expect(results.map((result) => result.id)).toContain("sample-interview");
    expect(results.map((result) => result.id)).not.toContain(
      "sample-resume-open-source",
    );
  });

  it("filters by category without changing relevance order", () => {
    const workspace = createDemoWorkspace();
    const allResults = searchWorkspace(workspace, "星河");
    const resumeResults = searchWorkspace(workspace, "星河", "resume");

    expect(resumeResults.length).toBeGreaterThan(0);
    expect(resumeResults.every((result) => result.type === "resume")).toBe(
      true,
    );
    expect(resumeResults.map((result) => result.id)).toEqual(
      allResults
        .filter((result) => result.type === "resume")
        .map((result) => result.id),
    );
  });

  it("does not expose hidden sync blocks or return results for an empty query", () => {
    const workspace = createDemoWorkspace();
    workspace.syncBlocks[0]!.hidden = true;

    expect(searchWorkspace(workspace, "事件循环", "sync")).toEqual([]);
    expect(searchWorkspace(workspace, "   ")).toEqual([]);
  });
});
