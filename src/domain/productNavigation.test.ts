import { describe, expect, it } from "vitest";
import { restoreProductView, resourceViews } from "./productNavigation";

describe("restoring the original product navigation", () => {
  it("reopens each former knowledge selection in its own resource page", () => {
    for (const kind of ["interview", "question", "sync", "resume"] as const) {
      expect(restoreProductView("knowledge", { kind, id: "saved" }, "cards")).toBe(resourceViews[kind]);
    }
    expect(restoreProductView("knowledge", null, "cards")).toBe("questions");
    expect(restoreProductView("organize", null, "cards")).toBe("interviews");
  });
  it("keeps practice view; practiceTab decides sub-page", () => {
    // mock view 已合并进 practice，practiceTab 决定进入哪个子页
    expect(restoreProductView("practice", null, "mock")).toBe("practice");
    expect(restoreProductView("practice", null, "history")).toBe("practice");
    expect(restoreProductView("practice", null, "cards")).toBe("practice");
    expect(restoreProductView("mock", null, "cards")).toBe("practice");
    expect(restoreProductView("review", null, "cards")).toBe("review");
  });
});
