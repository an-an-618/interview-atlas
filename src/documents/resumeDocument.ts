import { MAX_RESUME_TEXT_LENGTH, validateResumeInput } from "../ai/resumeExtraction";
import type { AIResumeInput } from "../ai/types";

export const RESUME_FILE_ACCEPT = ".docx,.pdf,.txt,.md,.png,.jpg,.jpeg,.webp";
export const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;

export interface PreparedResumeDocument {
  input: AIResumeInput;
  warnings: string[];
}

export function validateResumeFile(file: Pick<File, "name" | "size">): string {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "doc") throw new Error("旧版 Word（.doc）暂不支持，请另存为 .docx 或 PDF 后上传。");
  if (!["docx", "pdf", "txt", "md", "png", "jpg", "jpeg", "webp"].includes(extension)) {
    throw new Error("请选择 Word（.docx）、PDF、TXT、Markdown 或 PNG / JPEG / WebP 图片。");
  }
  if (!file.size) throw new Error("文件为空，请重新选择。");
  if (file.size > MAX_RESUME_FILE_BYTES) throw new Error("文件超过 10 MB，请精简或压缩后上传。");
  return extension;
}

export function validateResumeText(text: string): string {
  const normalized = text.replace(/^\uFEFF/u, "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("文件中没有可提取的文字。扫描简历请上传图片，并使用支持图片的模型。");
  if (normalized.length > MAX_RESUME_TEXT_LENGTH) {
    throw new Error("简历文字超过 10 万字符，请精简文件后重试；内容未被截短。");
  }
  if (normalized.includes("\u0000") || normalized.includes("\uFFFD")) {
    throw new Error("文件文字编码无法完整读取，请另存为 UTF-8 文本或重新导出 Word / PDF。");
  }
  return normalized;
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("文件读取已取消。", "AbortError");
}

function imageMime(bytes: Uint8Array, extension: string): string {
  const expected = extension === "jpg" || extension === "jpeg" ? "jpeg" : extension;
  const actual =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? "png" :
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "jpeg" :
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP" ? "webp" : "";
  if (actual !== expected) throw new Error("图片内容与扩展名不符，请重新导出 PNG、JPEG 或 WebP 文件。");
  return `image/${actual}`;
}

export async function prepareResumeDocument(
  file: File,
  signal?: AbortSignal,
): Promise<PreparedResumeDocument> {
  const extension = validateResumeFile(file);
  checkAborted(signal);
  const buffer = await file.arrayBuffer();
  checkAborted(signal);
  const warnings: string[] = [];
  let text: string;
  if (["png", "jpg", "jpeg", "webp"].includes(extension)) {
    const bytes = new Uint8Array(buffer);
    const mime = imageMime(bytes, extension);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8_192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
    }
    return { input: { kind: "images", imageDataUrls: [`data:${mime};base64,${btoa(binary)}`] }, warnings };
  }
  if (extension === "docx") {
    if (new Uint8Array(buffer)[0] !== 0x50 || new Uint8Array(buffer)[1] !== 0x4b) {
      throw new Error("文件不是有效的 .docx，请从 Word 重新另存后上传。");
    }
    const mammoth = await import("mammoth/mammoth.browser.js");
    checkAborted(signal);
    try {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      text = result.value;
      if (result.messages.length) warnings.push("Word 文件包含未完整识别的格式或对象，请核对提取文字与原文件。");
    } catch {
      throw new Error("无法读取 Word 文件。请确认文件未损坏、未加密，并另存为 .docx 或 PDF。");
    }
  } else if (extension === "pdf") {
    const { extractResumePdfText } = await import("./resumePdf");
    text = await extractResumePdfText(buffer, signal);
  } else {
    text = new TextDecoder("utf-8").decode(buffer);
  }
  checkAborted(signal);
  const input: AIResumeInput = { kind: "text", text: validateResumeText(text) };
  validateResumeInput(input);
  return { input, warnings };
}
