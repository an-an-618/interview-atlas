import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const checkDir = process.env.RESUME_CHECK_DIR ?? "/tmp/atlas-resume-check";
await mkdir(checkDir, { recursive: true });
const { app: { security: { csp } } } = JSON.parse(await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".woff": "font/woff", ".woff2": "font/woff2", ".png": "image/png", ".bcmap": "application/octet-stream" };
const evidence = "示例公司 产品实习 2025.01-2025.06\n完成 12 次访谈。\n示例大学 历史学 2024-2028";
const extracted = [
  { type: "实习", title: "产品实习", organization: "示例公司", period: "2025.01-2025.06", bullets: ["完成 12 次访谈。"], sourceExcerpt: "示例公司 产品实习" },
  { type: "教育", title: "历史学", organization: "示例大学", period: "2024-2028", bullets: [], sourceExcerpt: "示例大学 历史学" },
];
let mode = "success";
let releaseLate;
let observeRequest;
const requests = [];
const unexpected = [];
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/v1/chat/completions") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push({ body, authorization: request.headers.authorization });
      const test = body.messages[0].content.includes("这是连接测试");
      if (!test) {
        observeRequest?.();
        if (mode === "late") await new Promise((resolve) => { releaseLate = resolve; });
        if (mode === "failure") {
          response.writeHead(500, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: { message: "synthetic failure" } }));
          return;
        }
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ finish_reason: mode === "truncated" && !test ? "length" : "stop",
        message: { content: test ? "OK" : JSON.stringify({ experiences: mode === "empty" ? [] : extracted }) } }] }));
      return;
    }
    const path = resolve(root, `.${new URL(request.url, "http://localhost").pathname === "/" ? "/index.html" : new URL(request.url, "http://localhost").pathname}`);
    if (!path.startsWith(`${root}${sep}`) && path !== resolve(root, "index.html")) throw new Error("Invalid path");
    const bytes = await readFile(path);
    response.writeHead(200, { "Content-Type": mime[extname(path)] ?? "application/octet-stream", "Content-Security-Policy": csp });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const appUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-mock-keychain", "--password-store=basic"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
page.setDefaultTimeout(10_000);
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin === appUrl || ["data:", "blob:"].includes(url.protocol)) return route.continue();
  unexpected.push(url.origin);
  return route.abort();
});
const nav = (name) => page.locator(".sidebar").getByRole("button", { name, exact: true }).click();
const dialog = page.getByRole("dialog");
const upload = (name, buffer, mimeType) => dialog.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer: Buffer.from(buffer) });
const parseButton = () => dialog.getByRole("button", { name: "同意并开始解析" });
const consent = () => dialog.getByRole("checkbox", { name: /^我已阅读以上说明/ });
const stored = () => page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("interview-atlas");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const rows = await new Promise((resolve, reject) => {
    const request = db.transaction("resumeExperiences").objectStore("resumeExperiences").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return rows;
});
const open = async () => {
  await page.locator(".resume-page .page-header").getByRole("button", { name: "解析简历" }).click();
  await dialog.getByRole("heading", { name: "从简历提取经历" }).waitFor();
};
const close = async () => {
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
};
const waitRead = () => dialog.locator(".resume-import-source").first().waitFor();
const waitReview = () => dialog.getByRole("heading", { name: "确认简历经历" }).waitFor();
const geometry = async (width, prefix) => {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
  await dialog.evaluate(async (element) => {
    await document.fonts.ready;
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    element.querySelector(".resume-import-scroll").scrollTop = 0;
  });
  const measurements = await dialog.evaluate((element) => {
    const b = element.getBoundingClientRect();
    const foot = element.querySelector(".resume-import-actions").getBoundingClientRect();
    return { left: b.left, right: b.right, bottom: b.bottom, footer: foot.bottom, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  assert.equal(measurements.overflow, false);
  assert.ok(measurements.left >= 0 && measurements.right <= measurements.width + 1);
  assert.ok(measurements.bottom <= measurements.height + 1 && measurements.footer <= measurements.height + 1, JSON.stringify(measurements));
  await page.screenshot({ path: `${checkDir}/${prefix}-${width}.png` });
};

function pdfBuffer(lines, { chinese = false, blank = false } = {}) {
  const stream = blank ? "" : `BT /F1 12 Tf 40 780 Td ${lines.map((line, index) => {
    const encoded = chinese ? `<${[...line].map((char) => char.charCodeAt(0).toString(16).padStart(4, "0")).join("")}>` : `(${line})`;
    return `${index ? "0 -20 Td " : ""}${encoded} Tj`;
  }).join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    chinese ? "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [6 0 R] >>" : "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 0 >> /FontDescriptor 7 0 R /DW 1000 >>",
    "<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [0 -200 1000 1000] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((value, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}

try {
  await page.goto(appUrl);
  await page.locator(".overview-page").waitFor();
  await nav("简历经历");
  await open();
  assert.match(await dialog.locator(".resume-import-privacy").innerText(), /模型服务商将能读取/);
  assert.match(await dialog.locator(".resume-import-privacy").innerText(), /不会将简历或解析结果上传到自身服务器/);
  assert.match(await dialog.locator(".resume-import-privacy").innerText(), /无法保证服务商不留存/);
  assert.equal(await parseButton().isEnabled(), false);
  await dialog.getByRole("button", { name: "前往模型设置" }).click();
  await page.getByRole("button", { name: /^AI 服务/ }).click();
  const settings = page.locator(".ai-settings");
  await settings.locator("select").first().selectOption("custom");
  await settings.getByPlaceholder("输入模型名称").fill("resume-test-model");
  await settings.getByPlaceholder("https://api.example.com/v1").fill(`${appUrl}/v1`);
  await settings.getByPlaceholder("输入当前服务商的 API Key").fill("synthetic-key");
  await settings.getByRole("button", { name: "验证并启用" }).click();
  await settings.getByRole("button", { name: "已启用" }).waitFor();
  await nav("简历经历");

  // Preserve a manually authored experience throughout the import.
  await page.locator(".resume-page .page-header").getByRole("button", { name: "新增经历" }).click();
  await dialog.getByLabel("标题", { exact: true }).fill("手写经历");
  await dialog.getByLabel("经历要点 · 每行一条").fill("用户原内容");
  await dialog.getByRole("button", { name: "创建经历" }).click();
  await dialog.waitFor({ state: "detached" });
  const baseline = await stored();
  assert.equal(baseline.length, 1);
  await open();
  for (const width of [1440, 390, 320]) await geometry(width, "upload");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const before = requests.length;
  await upload("resume.txt", evidence, "text/plain");
  await waitRead();
  assert.equal(requests.length, before, "file selection makes no API request");
  assert.equal(await parseButton().isEnabled(), false);
  await consent().check();
  await parseButton().click();
  await waitReview();
  assert.equal((await stored()).length, 1, "AI candidates do not write before review");
  assert.equal(requests.length, before + 1);
  const request = requests.at(-1);
  assert.equal(request.body.model, "resume-test-model");
  assert.equal(request.authorization, "Bearer synthetic-key");
  assert.deepEqual(JSON.parse(request.body.messages[1].content), { task: "提取简历中的全部经历", resumeText: evidence });
  assert.equal(JSON.stringify(request.body).includes("手写经历"), false);
  const candidates = dialog.locator(".resume-import-candidate");
  await candidates.first().getByLabel("标题 *", { exact: true }).fill("产品实习 · 已核对");
  await candidates.nth(1).getByRole("checkbox").uncheck();
  for (const width of [1440, 390, 320]) await geometry(width, "review");
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Simulate unavailable local storage once; the review must survive intact for retry.
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, ...args) {
      const names = typeof stores === "string" ? [stores] : [...stores];
      if (mode === "readwrite" && names.includes("resumeExperiences")) {
        IDBDatabase.prototype.transaction = transaction;
        throw new DOMException("模拟本地存储空间不足", "QuotaExceededError");
      }
      return transaction.call(this, stores, mode, ...args);
    };
  });
  await dialog.getByRole("button", { name: "导入 1 段经历" }).click();
  await dialog.getByRole("alert").waitFor();
  assert.match(await dialog.getByRole("alert").innerText(), /模拟本地存储空间不足/);
  assert.equal((await stored()).length, 1);
  assert.equal(await candidates.first().getByLabel("标题 *", { exact: true }).inputValue(), "产品实习 · 已核对");
  await dialog.getByRole("button", { name: "导入 1 段经历" }).click();
  await dialog.waitFor({ state: "detached" });
  const imported = await stored();
  assert.equal(imported.length, 2);
  assert.deepEqual(imported.find((row) => row.id === baseline[0].id), baseline[0]);
  assert.equal(imported.find((row) => row.title === "产品实习 · 已核对").bullets[0], "完成 12 次访谈。");
  assert.equal(JSON.stringify(imported).includes("sourceExcerpt"), false);
  await page.reload();
  await page.locator(".overview-page").waitFor();
  await nav("简历经历");
  await page.getByRole("heading", { name: "产品实习 · 已核对", exact: true }).waitFor();

  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${evidence.split("\n").map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  await open();
  await upload("resume.docx", await zip.generateAsync({ type: "nodebuffer" }), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  await waitRead();
  assert.match(await dialog.locator(".resume-import-source pre").textContent(), /完成 12 次访谈/);
  await consent().check();
  await parseButton().click();
  await waitReview();
  assert.equal(await candidates.count(), 2);
  await dialog.getByRole("button", { name: "导入 2 段经历" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal((await stored()).length, 4);

  await open();
  await upload("resume.pdf", pdfBuffer(evidence.split("\n"), { chinese: true }), "application/pdf");
  await waitRead();
  assert.match(await dialog.locator(".resume-import-source pre").textContent(), /示例公司/);
  assert.match(await dialog.locator(".resume-import-source pre").textContent(), /示例大学/);
  await consent().check();
  await parseButton().click();
  await waitReview();
  assert.equal(await dialog.getByRole("button", { name: "导入 0 段经历" }).isEnabled(), false);
  assert.equal(await candidates.first().getByRole("checkbox").isChecked(), false, "possible duplicates require explicit selection");
  await dialog.getByRole("button", { name: "返回文件" }).click();
  await close();

  await open();
  await upload("scanned.pdf", pdfBuffer([], { blank: true }), "application/pdf");
  await dialog.getByRole("alert").waitFor();
  assert.match(await dialog.getByRole("alert").innerText(), /没有可提取文字/);
  await upload("resume.doc", "invalid", "application/msword");
  assert.match(await dialog.getByRole("alert").innerText(), /旧版 Word/);
  await close();

  await open();
  await upload("resume.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlWbooAAAAASUVORK5CYII=", "base64"), "image/png");
  await dialog.getByRole("checkbox", { name: /^我确认当前模型支持/ }).waitFor();
  await consent().check();
  assert.equal(await parseButton().isEnabled(), false, "image input requires a vision-capable model acknowledgement");
  await dialog.getByRole("checkbox", { name: /^我确认当前模型支持/ }).check();
  await parseButton().click();
  await waitReview();
  assert.equal(requests.at(-1).body.messages[1].content[1].type, "image_url");
  await dialog.getByRole("button", { name: "返回文件" }).click();
  await close();

  for (const failure of ["failure", "truncated", "empty"]) {
    mode = failure;
    await open();
    await upload("resume.txt", evidence, "text/plain");
    await waitRead();
    await consent().check();
    await parseButton().click();
    if (failure === "empty") {
      await waitReview();
      assert.equal(await candidates.count(), 0);
      assert.equal(await dialog.getByRole("button", { name: "导入 0 段经历" }).isEnabled(), false);
    } else {
      await dialog.getByRole("alert").waitFor();
      assert.match(await dialog.getByRole("alert").innerText(), failure === "failure" ? /暂时不可用/ : /不完整/);
    }
    await close();
    assert.equal((await stored()).length, 4);
  }
  mode = "late";
  await open();
  await upload("resume.txt", evidence, "text/plain");
  await waitRead();
  await consent().check();
  const requested = new Promise((resolve) => { observeRequest = resolve; });
  await parseButton().click();
  await requested;
  await dialog.getByRole("button", { name: "取消并关闭" }).click();
  await dialog.waitFor({ state: "detached" });
  releaseLate();
  await nav("设置");
  await nav("简历经历");
  assert.equal((await stored()).length, 4);
  assert.deepEqual(unexpected, [], "no undisclosed remote uploads or CDN resources");
  assert.deepEqual(pageErrors, []);
  console.log("PASS: DOCX and Chinese PDF local reading, production CSP, text and image API schema, disclosure and consent, editable selective import, persistence and save-failure recovery, duplicate review, invalid/scanned files, provider failure, truncation, empty results, cancellation, and 1440/390/320 layouts.");
} catch (reason) {
  await page.screenshot({ path: `${checkDir}/failure.png` });
  console.error({ pageErrors, unexpected });
  throw reason;
} finally {
  releaseLate?.();
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
