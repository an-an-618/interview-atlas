import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, IconButton, UIIcon } from "./UI";

describe("shared action contract", () => {
  it("does not submit a form unless explicitly requested", () => {
    expect(renderToStaticMarkup(createElement(Button, { children: "取消" }))).toContain('type="button"');
    expect(renderToStaticMarkup(createElement(Button, { type: "submit", children: "保存" }))).toContain('type="submit"');
  });
  it("locks loading actions and preserves their label and icon slot", () => {
    const html = renderToStaticMarkup(createElement(Button, { loading: true, icon: "save", children: "保存修改" }));
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-ui-icon="loading"');
    expect(html).toContain('class="ui-button-label">保存修改');
  });
  it("provides a readable name for icon-only controls", () => {
    const html = renderToStaticMarkup(createElement(IconButton, { icon: "favorite", label: "取消收藏", selected: true, "aria-pressed": true }));
    expect(html).toContain('aria-label="取消收藏"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('fill="currentColor"');
  });
  it("keeps internal navigation distinct from an external link", () => {
    const internal = renderToStaticMarkup(createElement(UIIcon, { name: "next" }));
    const external = renderToStaticMarkup(createElement(UIIcon, { name: "external" }));
    expect(internal).toContain("lucide-arrow-right");
    expect(internal).not.toContain("lucide-arrow-up-right");
    expect(external).toContain("lucide-arrow-up-right");
  });
});
