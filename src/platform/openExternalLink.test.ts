import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { MouseEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleExternalLinkClick } from "./openExternalLink";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

function createClickEvent(url: string) {
  return {
    currentTarget: { href: url },
    preventDefault: vi.fn(),
  } as unknown as MouseEvent<HTMLAnchorElement>;
}

describe("external links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens links in the system browser inside Tauri", () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const event = createClickEvent("https://console.xfyun.cn/services/new_lfasr");

    handleExternalLinkClick(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(openUrl).toHaveBeenCalledWith(
      "https://console.xfyun.cn/services/new_lfasr",
    );
  });

  it("keeps native anchor navigation in the web app", () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const event = createClickEvent("https://example.com");

    handleExternalLinkClick(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });
});
