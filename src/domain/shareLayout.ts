import { shareSections, type ShareDocument, type ShareOptions } from "./share";

export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT = 1440;
export const SHARE_MARGIN = 88;
export const SHARE_CONTENT_TOP = 148;
export const SHARE_CONTENT_BOTTOM = 1300;
export type TextStyle = "title" | "heading" | "body" | "meta" | "label" | "source";
export const shareTextStyles: Record<TextStyle, {
  size: number; height: number; weight: number; family: "serif" | "sans"; color: string;
}> = {
  title: { size: 50, height: 72, weight: 500, family: "serif", color: "#1c1b18" },
  heading: { size: 39, height: 58, weight: 500, family: "serif", color: "#1c1b18" },
  body: { size: 32, height: 52, weight: 400, family: "sans", color: "#3b3a35" },
  meta: { size: 25, height: 40, weight: 400, family: "sans", color: "#6b6960" },
  label: { size: 24, height: 40, weight: 500, family: "sans", color: "#c56542" },
  source: { size: 26, height: 42, weight: 400, family: "sans", color: "#6b6960" },
};
export interface ShareLine {
  text: string;
  style: TextStyle;
  y: number;
  x?: number;
  marker?: string;
}
export interface SharePage { lines: ShareLine[] }
export type MeasureText = (text: string, style: TextStyle) => number;

const graphemes = new Intl.Segmenter("zh", { granularity: "grapheme" });
const forbiddenStart = /^[，。！？；：、）》」』】”’,.!?;:)\]]/u;
const forbiddenEnd = /[（《「『【“‘([]$/u;

/** Preserve every grapheme and explicit newline, including emoji and long URLs. */
export function wrapShareText(text: string, width: number, style: TextStyle, measure: MeasureText): string[] {
  return text.replace(/\r\n?/gu, "\n").split("\n").flatMap((paragraph) => {
    if (!paragraph) return [""];
    const chars = Array.from(graphemes.segment(paragraph), (part) => part.segment);
    const lines: string[] = [];
    let start = 0;
    while (start < chars.length) {
      let end = start;
      let line = "";
      while (end < chars.length && measure(line + chars[end], style) <= width) {
        line += chars[end];
        end += 1;
      }
      if (end === start) end += 1;
      // Move punctuation together with the preceding/following character.
      if (end < chars.length && end - start > 1) {
        if (forbiddenStart.test(chars[end]!)) end -= 1;
        if (end - start > 1 && forbiddenEnd.test(chars[end - 1]!)) end -= 1;
        // Keep ordinary English words together when the word fits a line.
        const joined = chars.slice(start, end).join("");
        const space = joined.lastIndexOf(" ");
        if (/[a-z0-9]/iu.test(chars[end - 1]!) && /^[a-z0-9]/iu.test(chars[end]!) && space > joined.length / 2) {
          const prefix = joined.slice(0, space + 1);
          end = start + Array.from(graphemes.segment(prefix)).length;
        }
      }
      lines.push(chars.slice(start, end).join(""));
      start = end;
    }
    return lines;
  });
}

/** Paginate text, rather than cropping a screenshot or reducing type size. */
export function layoutSharePages(document: ShareDocument, options: ShareOptions, measure: MeasureText): SharePage[] {
  const pages: SharePage[] = [{ lines: [] }];
  let y = SHARE_CONTENT_TOP;
  const width = SHARE_WIDTH - SHARE_MARGIN * 2;
  const nextPage = () => {
    pages.push({ lines: [] });
    y = SHARE_CONTENT_TOP;
  };
  const add = (text: string, style: TextStyle, extra: Pick<ShareLine, "x" | "marker"> = {}) => {
    const height = shareTextStyles[style].height;
    if (y + height > SHARE_CONTENT_BOTTOM) nextPage();
    pages[pages.length - 1]!.lines.push({ text, style, y, ...extra });
    y += height;
  };
  for (const section of shareSections(document, options)) {
    if (section.items) {
      const indent = 52;
      const gap = 16;
      const lineHeight = shareTextStyles.source.height;
      const headingHeight = shareTextStyles.label.height + 12;
      const capacity = SHARE_CONTENT_BOTTOM - SHARE_CONTENT_TOP;
      const rows = section.items.map((item) => wrapShareText(item, width - indent, "source", measure));
      const fullHeight = headingHeight + rows.reduce((sum, row) => sum + row.length * lineHeight + gap, 0) - gap;
      // Move a short source list together; keep each longer entry intact where it fits.
      const firstHeight = (rows[0]?.length ?? 1) * lineHeight;
      const minimum = headingHeight + (firstHeight <= capacity - headingHeight ? firstHeight : 2 * lineHeight);
      if (pages.at(-1)!.lines.length && y + (fullHeight <= capacity ? fullHeight : minimum) > SHARE_CONTENT_BOTTOM) nextPage();
      const sourceHeading = (continued: boolean) => {
        add(continued ? `${section.label} · 续` : section.label, "label");
        y += 12;
      };
      sourceHeading(false);
      rows.forEach((row, index) => {
        const rowHeight = row.length * lineHeight;
        if (y + rowHeight > SHARE_CONTENT_BOTTOM && rowHeight <= capacity - headingHeight) {
          nextPage();
          sourceHeading(true);
        }
        row.forEach((line, lineIndex) => {
          if (y + lineHeight > SHARE_CONTENT_BOTTOM) {
            nextPage();
            sourceHeading(true);
          }
          add(line, "source", {
            x: SHARE_MARGIN + indent,
            ...(lineIndex === 0 ? { marker: String(index + 1).padStart(2, "0") } : {}),
          });
        });
        y += gap;
      });
      y += 18;
      continue;
    }
    if (section.label === "title" || section.label === "subtitle") {
      const style = section.label === "title" ? "title" : "meta";
      wrapShareText(section.body, width, style, measure).forEach((line) => add(line, style));
      y += section.label === "title" ? 16 : 20;
      continue;
    }
    const supplemental = ["时间信息", "标签", "记录来源", "来源面试"].includes(section.label);
    const bodyStyle = supplemental ? "meta" : "body";
    const titleLines = section.title ? wrapShareText(section.title, width, "heading", measure) : [];
    const bodyLines = wrapShareText(section.body, width, bodyStyle, measure);
    // Keep a label, its heading and at least one answer line together when possible.
    const minimum = 52
      + (titleLines.length ? Math.min(titleLines.length, 2) * shareTextStyles.heading.height + 12 : 0)
      + shareTextStyles[bodyStyle].height;
    if (y + minimum > SHARE_CONTENT_BOTTOM && pages[pages.length - 1]!.lines.length) nextPage();
    add(section.label, "label");
    y += 12;
    titleLines.forEach((line) => add(line, "heading"));
    if (titleLines.length) y += 12;
    bodyLines.forEach((line) => add(line, bodyStyle));
    y += supplemental ? 24 : 34;
  }
  return pages;
}
