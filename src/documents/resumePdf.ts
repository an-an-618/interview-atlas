import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { MAX_RESUME_TEXT_LENGTH } from "../ai/resumeExtraction";

GlobalWorkerOptions.workerSrc = workerUrl;

// PDF.js reads only packaged resources. Document-supplied URLs are never fetched.
const cMaps = import.meta.glob<string>("/node_modules/pdfjs-dist/cmaps/*.bcmap", {
  query: "?url&no-inline", import: "default", eager: true,
});

class LocalPdfResources {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = kind === "cMapUrl" ? cMaps[`/node_modules/pdfjs-dist/cmaps/${filename}`] : undefined;
    if (!url) throw new Error("PDF 请求了不支持的本地字体资源。");
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) throw new Error("无法读取本地 PDF 字体资源。");
    return new Uint8Array(await response.arrayBuffer());
  }
}

export async function extractResumePdfText(buffer: ArrayBuffer, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new DOMException("文件读取已取消。", "AbortError");
  const task = getDocument({
    data: new Uint8Array(buffer),
    BinaryDataFactory: LocalPdfResources,
    useWorkerFetch: false,
    useWasm: false,
    disableFontFace: true,
    useSystemFonts: true,
    stopAtErrors: true,
    verbosity: 0,
  });
  const cancel = () => { void task.destroy(); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const document = await task.promise;
    if (document.numPages > 30) throw new Error("简历 PDF 超过 30 页，请精简文件后上传；页面未被截短。");
    const pages: string[] = [];
    const emptyPages: number[] = [];
    let length = 0;
    for (let number = 1; number <= document.numPages; number += 1) {
      if (signal?.aborted) throw new DOMException("文件读取已取消。", "AbortError");
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let line = "";
      let previousY: number | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5] as number;
        if (previousY !== null && Math.abs(y - previousY) > 3 && line.trim()) {
          lines.push(line.trim());
          line = "";
        }
        line += `${item.str}${item.hasEOL ? "\n" : " "}`;
        previousY = y;
      }
      if (line.trim()) lines.push(line.trim());
      const text = lines.join("\n").trim();
      if (!text) emptyPages.push(number);
      pages.push(text);
      length += text.length + 2;
      page.cleanup();
      if (length > MAX_RESUME_TEXT_LENGTH) throw new Error("简历文字超过 10 万字符，请精简文件后重试；内容未被截短。");
    }
    if (emptyPages.length) {
      throw new Error(`PDF 第 ${emptyPages.join("、")} 页没有可提取文字，可能是扫描页或空白页。请移除空白页，或先进行 OCR 后上传；扫描简历也可逐张上传图片并使用支持图片的模型。`);
    }
    return pages.join("\n\n");
  } catch (reason) {
    if (signal?.aborted) throw new DOMException("文件读取已取消。", "AbortError");
    if (reason instanceof Error && reason.name === "PasswordException") {
      throw new Error("PDF 已加密，请解除密码保护后上传。");
    }
    if (reason instanceof Error && /InvalidPDF|UnknownError/.test(reason.name)) {
      throw new Error("PDF 无法读取，请确认文件未损坏，并重新导出后上传。");
    }
    throw reason;
  } finally {
    signal?.removeEventListener("abort", cancel);
    await task.destroy();
  }
}
