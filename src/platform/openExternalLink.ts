import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { MouseEvent } from "react";

export function handleExternalLinkClick(
  event: MouseEvent<HTMLAnchorElement>,
) {
  if (!isTauri()) return;

  event.preventDefault();
  void openUrl(event.currentTarget.href).catch((error: unknown) => {
    console.error("无法在系统浏览器中打开链接", error);
  });
}
