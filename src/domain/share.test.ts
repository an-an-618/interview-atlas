import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "../data/demo";
import {
  buildShareDocument, defaultShareOptions, shareFilename, shareSections,
  type ShareDocument, type ShareOptions,
} from "./share";
import {
  layoutSharePages, SHARE_CONTENT_BOTTOM, SHARE_CONTENT_TOP, SHARE_MARGIN,
  SHARE_WIDTH, shareTextStyles, wrapShareText, type TextStyle,
} from "./shareLayout";

const allOptions: ShareOptions = { source: true, dates: true, tags: true, notes: true, raw: true, watermark: true };
const measure = (text: string, style: TextStyle) =>
  Array.from(new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text)).length * shareTextStyles[style].size;

describe("share content and provenance", () => {
  it("exports atomic questions without optional metadata by default, without changing the workspace", () => {
    const workspace = createDemoWorkspace();
    const before = structuredClone(workspace);
    const question = workspace.questions[0]!;
    question.notes = "只在打开笔记时导出";
    before.questions[0]!.notes = question.notes;
    const document = buildShareDocument({ kind: "question", id: question.id }, workspace);
    const options = defaultShareOptions(document);
    expect(options).toEqual({ source: false, dates: false, tags: false, notes: false, raw: false, watermark: false });
    expect(shareSections(document, options)).toEqual([
      { label: "title", body: question.title },
      { label: "回答", body: question.answer },
    ]);
    const full = shareSections(document, allOptions);
    expect(full.some((section) => section.label === "来源面试")).toBe(true);
    expect(full.some((section) => section.body === question.notes)).toBe(true);
    expect(full.some((section) => section.label === "时间信息")).toBe(true);
    expect(full.some((section) => section.label === "标签")).toBe(true);
    expect(workspace).toEqual(before);
  });

  it("resolves aggregate and resume provenance through relationships without exporting related atomic questions", () => {
    const workspace = createDemoWorkspace();
    const block = workspace.syncBlocks[0]!;
    const question = workspace.questions.find((item) => block.linkedQuestionIds.includes(item.id))!;
    question.title = "此关联问题不能出现在聚合分享正文";
    // Legacy data may have only the question-to-block edge.
    block.linkedQuestionIds = [];
    question.linkedSyncBlockId = block.id;
    const aggregate = buildShareDocument({ kind: "aggregate", id: block.id }, workspace);
    expect(aggregate.sources.length).toBeGreaterThan(0);
    expect(JSON.stringify(shareSections(aggregate, allOptions))).not.toContain(question.title);
    expect(aggregate.sections).toEqual([{ label: "聚合回答", body: block.body }]);
    const resume = workspace.resumeExperiences[0]!;
    resume.linkedQuestionIds = [];
    resume.linkedSyncBlockIds = [block.id];
    const document = buildShareDocument({ kind: "resume", id: resume.id }, workspace);
    expect(document.sources).toEqual(aggregate.sources);
    expect(document.sections[0]!.body).toContain(resume.bullets[0]!);
    expect(document.dates).toContain(resume.period);
  });

  it("exports every interview question in order, including legacy one-sided edges, and makes raw text optional", () => {
    const workspace = createDemoWorkspace();
    const interview = workspace.interviews[0]!;
    const first = workspace.questions.find((question) => interview.questionIds.includes(question.id))!;
    const extra = { ...first, id: "one-sided", title: "尾部问题", sourceInterviewIds: [interview.id] };
    workspace.questions.push(extra);
    const document = buildShareDocument({ kind: "interview", id: interview.id }, workspace);
    expect(document.sections.map((section) => section.title)).toEqual([
      ...interview.questionIds.map((id) => workspace.questions.find((question) => question.id === id)!.title),
      "尾部问题",
    ]);
    expect(shareSections(document, defaultShareOptions(document)).some((section) => section.body === interview.rawText)).toBe(false);
    expect(shareSections(document, allOptions).at(-1)?.label).toBe("记录来源");
    expect(shareSections(document, allOptions).some((section) => section.body === interview.rawText)).toBe(true);
  });

  it("uses the complete raw interview when no questions have been organized and handles empty content", () => {
    const workspace = createDemoWorkspace();
    workspace.questions = [];
    const interview = workspace.interviews[0]!;
    interview.questionIds = [];
    const document = buildShareDocument({ kind: "interview", id: interview.id }, workspace);
    expect(defaultShareOptions(document).raw).toBe(true);
    expect(shareSections(document, defaultShareOptions(document)).at(-1)?.body).toBe(interview.rawText);
    interview.rawText = "";
    const empty = buildShareDocument({ kind: "interview", id: interview.id }, workspace);
    expect(shareSections(empty, defaultShareOptions(empty)).at(-1)?.body).toContain("尚未整理问答");
    expect(() => buildShareDocument({ kind: "question", id: "missing" }, workspace)).toThrow();
  });

  it("creates safe, ordered PNG names", () => {
    const workspace = createDemoWorkspace();
    const document = buildShareDocument({ kind: "question", id: workspace.questions[0]!.id }, workspace);
    document.title = '标题/\\:*?"<>|\n';
    expect(shareFilename(document, 2, 11)).toBe("见字如面-原子问答-标题-02of11.png");
    document.title = "分享👨‍👩‍👧‍👦".repeat(80);
    const filename = shareFilename(document, 1, 2);
    expect(new TextEncoder().encode(filename).length).toBeLessThan(240);
    expect(filename).not.toContain("\ufffd");
  });
});

describe("share pagination", () => {
  it("moves a short source list together and gives wrapped entries a hanging indent", () => {
    const workspace = createDemoWorkspace();
    const document = buildShareDocument({ kind: "aggregate", id: workspace.syncBlocks[0]!.id }, workspace);
    document.title = "判断依据";
    document.sections = [{ label: "聚合回答", body: "答".repeat(420) }];
    document.sources = ["字节跳动 · 产品经理 · 一面", "一个公司名称很长的来源".repeat(8) + " · AI 产品经理 · 二面", "美团 · 产品经理 · 一面"];
    const options = { ...defaultShareOptions(document), source: true };
    const pages = layoutSharePages(document, options, measure);
    const sourcePages = pages.filter((page) => page.lines.some((line) => line.style === "source"));
    expect(sourcePages).toHaveLength(1);
    expect(sourcePages[0]!.lines[0]!.text).toBe("来源面试");
    const lines = sourcePages[0]!.lines.filter((line) => line.style === "source");
    expect(lines.map((line) => line.text).join("")).toBe(document.sources.join(""));
    expect(lines.filter((line) => line.marker).map((line) => line.marker)).toEqual(["01", "02", "03"]);
    expect(lines.every((line) => line.x === SHARE_MARGIN + 52 && measure(line.text, "source") <= SHARE_WIDTH - SHARE_MARGIN * 2 - 52)).toBe(true);
  });

  it("continues large source lists with headings, preserves complete entries and keeps ordinary entries on one page", () => {
    const workspace = createDemoWorkspace();
    const document = buildShareDocument({ kind: "aggregate", id: workspace.syncBlocks[0]!.id }, workspace);
    document.sources = Array.from({ length: 16 }, (_, index) => `来源 ${index} · ${"公司与岗位".repeat(18)} · 二面`);
    document.sources.push("极长的单个来源".repeat(500));
    const pages = layoutSharePages(document, { ...defaultShareOptions(document), source: true }, measure);
    const lines = pages.flatMap((page) => page.lines);
    expect(lines.filter((line) => line.style === "source").map((line) => line.text).join("")).toBe(document.sources.join(""));
    expect(lines.filter((line) => line.marker).map((line) => line.marker)).toEqual(document.sources.map((_, index) => String(index + 1).padStart(2, "0")));
    for (const page of pages) {
      const first = page.lines.findIndex((line) => line.style === "source");
      if (first < 0) continue;
      expect(page.lines[first - 1]!.text).toMatch(/^来源面试/);
      expect(page.lines.every((line) => line.y >= SHARE_CONTENT_TOP && line.y + shareTextStyles[line.style].height <= SHARE_CONTENT_BOTTOM)).toBe(true);
      expect(page.lines.at(-1)!.style).toBe("source");
    }
    for (let index = 0; index < 16; index++) {
      const row = wrapShareText(document.sources[index]!, SHARE_WIDTH - SHARE_MARGIN * 2 - 52, "source", measure);
      const page = pages.find((item) => item.lines.some((line) => line.marker === String(index + 1).padStart(2, "0")))!;
      const start = page.lines.findIndex((line) => line.marker === String(index + 1).padStart(2, "0"));
      expect(page.lines.slice(start, start + row.length).map((line) => line.text)).toEqual(row);
    }
    expect(layoutSharePages(document, { ...defaultShareOptions(document), source: true, watermark: true }, measure)).toEqual(pages);
  });

  it("preserves mixed CJK, English, whitespace, emoji and long URLs while wrapping within the image width", () => {
    const text = "这是第一段，包含标点（和括号）。 English words 👨‍👩‍👧‍👦 e\u0301  \n\nhttps://example.com/" + "verylong".repeat(150);
    const width = SHARE_WIDTH - SHARE_MARGIN * 2;
    const lines = wrapShareText(text, width, "body", measure);
    expect(lines.join("")).toBe(text.replace(/\n/gu, ""));
    expect(lines).toContain("");
    expect(lines.some((line) => line.includes("👨‍👩‍👧‍👦"))).toBe(true);
    expect(lines.every((line) => measure(line, "body") <= width)).toBe(true);
  });

  it("paginates very long headings and answers without losing text, blank pages or clipping", () => {
    const workspace = createDemoWorkspace();
    const document: ShareDocument = buildShareDocument({ kind: "question", id: workspace.questions[0]!.id }, workspace);
    document.title = "很长的问题".repeat(150);
    document.sections = [{ label: "回答", body: "这是一段完整的回答，所有字符都应导出。".repeat(1200) }];
    const pages = layoutSharePages(document, defaultShareOptions(document), measure);
    expect(pages.length).toBeGreaterThan(20);
    expect(pages.every((page) => page.lines.length > 0)).toBe(true);
    const lines = pages.flatMap((page) => page.lines);
    expect(lines.filter((line) => line.style === "title").map((line) => line.text).join("")).toBe(document.title);
    expect(lines.filter((line) => line.style === "body").map((line) => line.text).join("")).toBe(document.sections[0]!.body);
    expect(lines.every((line) => line.y >= SHARE_CONTENT_TOP && line.y + shareTextStyles[line.style].height <= SHARE_CONTENT_BOTTOM)).toBe(true);
  });

  it("keeps normal question headings with at least the first answer line across page boundaries", () => {
    const workspace = createDemoWorkspace();
    const document = buildShareDocument({ kind: "interview", id: workspace.interviews[0]!.id }, workspace);
    document.sections = Array.from({ length: 12 }, (_, index) => ({
      label: `问答 ${index}`, title: `第${index}题`, body: "内容。".repeat(70),
    }));
    const pages = layoutSharePages(document, defaultShareOptions(document), measure);
    for (const page of pages) {
      const labelIndex = page.lines.map((line) => line.style).lastIndexOf("label");
      if (labelIndex < 0) continue;
      expect(page.lines.slice(labelIndex + 1).some((line) => line.style === "heading")).toBe(true);
      expect(page.lines.slice(labelIndex + 1).some((line) => line.style === "body")).toBe(true);
    }
  });
});
