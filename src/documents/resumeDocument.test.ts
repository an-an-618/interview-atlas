import { describe, expect, it } from "vitest";
import { MAX_RESUME_FILE_BYTES, prepareResumeDocument, validateResumeFile, validateResumeText } from "./resumeDocument";
import JSZip from "jszip";

describe("local resume document reading", () => {
  it("reads UTF-8 text, normalizes newlines and retains the complete evidence", async () => {
    const result = await prepareResumeDocument(new File(["\uFEFF教育\r\n示例大学\r\n"], "resume.MD"));
    expect(result).toEqual({ input: { kind: "text", text: "教育\n示例大学" }, warnings: [] });
  });

  it("rejects unsupported, empty, oversized and incorrectly encoded files", async () => {
    expect(() => validateResumeFile({ name: "resume.doc", size: 10 })).toThrow(".docx");
    expect(() => validateResumeFile({ name: "resume.exe", size: 10 })).toThrow("请选择");
    expect(() => validateResumeFile({ name: "resume.pdf", size: 0 })).toThrow("为空");
    expect(() => validateResumeFile({ name: "resume.docx", size: MAX_RESUME_FILE_BYTES + 1 })).toThrow("10 MB");
    expect(() => validateResumeText("a".repeat(100_001))).toThrow("未被截短");
    expect(() => validateResumeText("教育\uFFFD")).toThrow("编码");
    await expect(prepareResumeDocument(new File(["fake docx"], "resume.docx"))).rejects.toThrow("有效");
  });

  it("reads real Word paragraphs and tables without converting document HTML", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>示例公司 产品实习</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>负责用户访谈，完成 12 次调研。</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const result = await prepareResumeDocument(new File([buffer], "resume.docx"));
    expect(result.input.kind).toBe("text");
    if (result.input.kind === "text") {
      expect(result.input.text).toContain("示例公司 产品实习");
      expect(result.input.text).toContain("完成 12 次调研。");
      expect(result.input.text).not.toContain("<w:");
    }
  });

  it("prepares a local image for multimodal input and validates its actual format", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
    const result = await prepareResumeDocument(new File([bytes], "resume.png"));
    expect(result.input).toEqual({ kind: "images", imageDataUrls: ["data:image/png;base64,iVBORw0KGgo="] });
    await expect(prepareResumeDocument(new File([bytes], "resume.jpg"))).rejects.toThrow("扩展名不符");
  });

  it("does not read a file after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(prepareResumeDocument(new File(["example"], "resume.txt"), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
