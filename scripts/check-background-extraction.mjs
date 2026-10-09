// Run against a Vite dev server and an isolated Chrome profile.
// PLAYWRIGHT_MODULE may point at an existing Playwright installation.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = process.env.CHROME_CDP
  ? await chromium.connectOverCDP(process.env.CHROME_CDP)
  : await chromium.launch({
      executablePath:
        process.env.CHROME_PATH ??
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--use-mock-keychain", "--password-store=basic"],
    });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const pending = [];
async function respond(route, payload) {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(payload) } }] }),
  });
}
await context.route("https://ai-check.invalid/**", async (route) => {
  const data = JSON.parse(route.request().postDataJSON().messages[1].content);
  if (data.stage === "inventory") { pending.push(route); return; }
  if (data.stage === "coverage") { await respond(route, { questions: [], hasMore: false }); return; }
  if (data.stage === "answers") {
    await respond(route, { questions: data.targets.map(({ id }) => ({ id, answerPoints: ["先测量关键指标。"], tags: ["性能"] })) });
    return;
  }
  await respond(route, { matches: data.questions.map(({ id }) => ({ id, suggestedSyncBlockId: null, matchReason: "" })) });
});
const base = process.env.APP_URL ?? "http://127.0.0.1:43225";
const wait = (fn) => page.waitForFunction(fn);
async function nav(name) {
  await page.locator(".sidebar").getByRole("button", { name, exact: false }).click();
}
async function start(company) {
  await page.locator(".sidebar").getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("button", { name: /导入面经/ }).click();
  await page.getByLabel("面试原文", { exact: true }).fill(`${company} · 前端一面 · 2020-01-01\n1. 如何优化性能？\n答：先测量关键指标。`);
  await page.getByRole("button", { name: /AI 提取/ }).click();
  await page.getByRole("heading", { name: "AI 正在为你拆解…" }).waitFor();
}
async function reply(index) {
  assert.ok(pending[index], `request ${index} exists`);
  const data = JSON.parse(pending[index].request().postDataJSON().messages[1].content);
  const sourceId = data.source.find((part) => part.text.includes("如何优化性能？")).id;
  await respond(pending[index], {
    questions: [{ title: "如何优化性能？", sourceId, quote: "如何优化性能？", occurrence: 1 }],
    hasMore: false,
  });
}
async function stored() {
  return page.evaluate(async () => (await import("/src/data/repository.ts")).indexedDbRepository.load());
}
try {
  await page.goto(base);
  await page.locator(".overview-page").waitFor();
  await page.evaluate(async () => {
    const { indexedDbRepository: repo } = await import("/src/data/repository.ts");
    await repo.setPreference("ai.provider.config", {
      protocol: "openai-compatible", endpoint: "https://ai-check.invalid/v1", model: "test",
    });
    sessionStorage.setItem("interview-atlas.ai.provider-keys", JSON.stringify({ custom: "synthetic-test-key" }));
  });
  await page.reload();
  await page.locator(".overview-page").waitFor();
  await start("异步验证甲");
  await page.getByRole("button", { name: "在后台继续", exact: true }).click();
  await nav("主页");
  assert.match(await page.locator(".pending-review-panel").innerText(), /异步验证甲[\s\S]*AI 处理中/);
  await start("异步验证乙");
  await page.getByRole("heading", { name: "排队中", exact: true }).waitFor();
  await page.getByRole("button", { name: "在后台继续", exact: true }).click();
  await nav("面试记录");
  assert.match(await page.locator(".interview-row").first().innerText(), /异步验证乙[\s\S]*排队中/);
  assert.equal(pending.length, 1, "only one provider request before completion");
  await nav("主页");
  await page.locator(".pending-review-preview").getByRole("button", { name: /异步验证甲/ }).click();
  await page.locator(".ai-review-page").waitFor();
  assert.match(await page.locator(".ai-review-page-state").innerText(), /正在拆解面经/);
  await page.locator(".ai-review-page-toolbar").getByRole("button", { name: "返回", exact: true }).click();
  await reply(0);
  await page.locator(".extraction-notification").filter({ hasText: "异步验证甲" }).waitFor();
  await wait(() => document.querySelector(".pending-review-panel")?.textContent.includes("AI 处理中"));
  await page.waitForFunction(async () => {
    const { indexedDbRepository: repo } = await import("/src/data/repository.ts");
    const workspace = await repo.load();
    return workspace.interviews.find((item) => item.company === "异步验证乙")?.extractionTask.status === "running";
  });
  // A concurrent independent manual edit must survive the second result.
  await nav("原子问答");
  await page.getByRole("button", { name: "新建原子问答", exact: true }).first().click();
  await page.locator(".modal").waitFor();
  const inputs = page.locator(".modal input");
  await inputs.first().fill("后台处理期间手动保存的问题");
  await page.locator(".modal").getByRole("button", { name: "添加原子问答" }).click();
  await reply(1);
  await page.locator(".extraction-notification").filter({ hasText: "异步验证乙" }).waitFor();
  let workspace = await stored();
  assert.equal(workspace.aiReviews.length, 2);
  assert.ok(workspace.questions.some((item) => item.title === "后台处理期间手动保存的问题"));
  assert.ok(!JSON.stringify(workspace).includes("synthetic-test-key"));
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH });
  await page.locator(".extraction-notification").filter({ hasText: "异步验证甲" }).getByRole("button", { name: "查看并审核" }).click();
  await page.locator(".ai-review-page").getByRole("button", { name: "采纳为原子问答" }).click();
  await wait(() => document.body.textContent.includes("本次 AI 解析审核已完成"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".extraction-notification").filter({ hasText: "异步验证乙" }).getByRole("button", { name: "查看并审核" }).click();
  await page.locator(".ai-review-page").waitFor();
  await page.locator(".ai-review-page").getByRole("button", { name: "采纳为原子问答" }).click();
  workspace = await stored();
  assert.equal(workspace.questions.filter((item) => item.title === "如何优化性能？").length, 2);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.locator(".overview-page").waitFor();
  assert.equal(await page.locator(".extraction-notification").count(), 0, "read notifications stay dismissed");
  await start("刷新中断验证");
  await page.getByRole("button", { name: "在后台继续" }).click();
  await page.waitForFunction(async () => {
    const { indexedDbRepository: repo } = await import("/src/data/repository.ts");
    return (await repo.load()).interviews.some((item) => item.company === "刷新中断验证" && item.extractionTask.status === "running");
  });
  await page.reload();
  await page.locator(".overview-page").waitFor();
  assert.match(await page.locator(".pending-review-panel").innerText(), /处理已中断/);
  assert.deepEqual(errors, []);
  console.log("PASS: background close / FIFO / overview / list ordering / persistence / concurrent edit / notifications / desktop & mobile acceptance / reload interruption");
} finally {
  await context.close();
  await browser.close();
}
