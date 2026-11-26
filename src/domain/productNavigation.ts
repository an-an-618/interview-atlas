import type { KnowledgeTarget } from "./workbench";

export type ProductView = "overview" | "review" | "search" | "create" | "mock"
  | "interviews" | "questions" | "sync" | "resume" | "settings" | "practice";

export const resourceViews = {
  interview: "interviews", question: "questions", sync: "sync", resume: "resume",
} as const;

// Preserve the selected content when reopening a tab from the former workspace.
export function restoreProductView(
  view: ProductView | "organize" | "knowledge",
  target: KnowledgeTarget | null,
  practiceTab: "cards" | "mock" | "history",
): ProductView {
  if (view === "organize") return "interviews";
  if (view === "knowledge") return target ? resourceViews[target.kind] : "questions";
  // mock view 已合并进 practice，旧 tab 状态回退
  if (view === "mock") return "practice";
  return view;
}
