import { describe, expect, it } from "vitest";
import { buildResumeBulletDiff } from "./Resume";

describe("resume bullet diff", () => {
  it("preserves unchanged lines and marks replacements explicitly", () => {
    expect(
      buildResumeBulletDiff(
        ["负责性能治理", "推动监控上线"],
        ["负责性能治理", "推动监控覆盖率提升至 95%"],
      ),
    ).toEqual([
      { kind: "same", value: "负责性能治理" },
      { kind: "removed", value: "推动监控上线" },
      { kind: "added", value: "推动监控覆盖率提升至 95%" },
    ]);
  });

  it("marks inserted and deleted resume bullets", () => {
    expect(buildResumeBulletDiff(["保留", "删除"], ["新增", "保留"])).toEqual([
      { kind: "added", value: "新增" },
      { kind: "same", value: "保留" },
      { kind: "removed", value: "删除" },
    ]);
  });
});
