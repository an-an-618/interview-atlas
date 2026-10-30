import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:43227";
const origin = new URL(appUrl).origin;
const screenshotDir = process.env.SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-mock-keychain", "--password-store=basic"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(10_000);
const errors = [];
const externalRequests = [];
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin === origin || ["data:", "blob:"].includes(url.protocol)) return route.continue();
  externalRequests.push(url.origin);
  return route.abort();
});

const search = page.getByRole("textbox", { name: "搜索聚合块", exact: true });
const directory = page.getByRole("navigation", { name: "聚合块列表", exact: true });
const selectProject = () => page.locator(".sync-list-select").filter({ hasText: "项目复盘" }).click();
const waitForCount = (count) => page.waitForFunction(
  (expected) => document.querySelectorAll(".sync-list-item").length === expected,
  count,
);
const assertLayout = async (label) => {
  await page.waitForFunction(() => {
    const bounds = document.querySelector(".sync-detail")?.getBoundingClientRect();
    return bounds && bounds.height > 120 && bounds.top >= 0 && bounds.bottom <= window.innerHeight + 1;
  });
  const geometry = await page.evaluate(() => {
    const detail = document.querySelector(".sync-detail");
    const bounds = detail?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      width: bounds?.width ?? 0,
      height: bounds?.height ?? 0,
      top: bounds?.top ?? 0,
      bottom: bounds?.bottom ?? 0,
      viewport: window.innerHeight,
    };
  });
  assert.equal(geometry.overflow, false, `${label}: no horizontal overflow`);
  assert.ok(geometry.width > 200 && geometry.height > 120, `${label}: readable detail area`);
  assert.ok(geometry.top >= 0 && geometry.bottom <= geometry.viewport + 1, `${label}: detail fits viewport ${JSON.stringify(geometry)}`);
};
const screenshot = async (name) => {
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true });
};

try {
  await page.goto(appUrl);
  await page.locator(".overview-page").waitFor();
  await page.evaluate(async () => {
    const { createDemoWorkspace } = await import("/src/data/demo.ts");
    const { addSyncBlock } = await import("/src/domain/workspace.ts");
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    let workspace = createDemoWorkspace();
    workspace.syncBlocks.forEach((block) => { block.favorite = false; });
    const result = addSyncBlock(workspace, {
      title: "项目复盘与取舍",
      body: "先说明项目目标与约束，用 STAR framework 组织背景、行动和结果。\n结合具体证据解释方案取舍，包括收益、成本和没有采用的路径。\n回到结果复盘，区分当时的判断与后续验证，记录可以改进的环节。",
      reviewNotes: "下次补充量化指标，明确个人贡献和团队成果。",
      questionIds: ["sample-collaboration"],
      resumeExperienceIds: [workspace.resumeExperiences[0].id],
    });
    workspace = result.workspace;
    workspace.syncBlocks.find((block) => block.id === result.syncBlock.id).favorite = true;
    const base = { ...result.syncBlock, linkedQuestionIds: [], favorite: false };
    workspace.syncBlocks.push(
      { ...base, id: "research", title: "用户研究", body: "从访谈中验证需求与假设。", reviewNotes: "补充样本选择依据。" },
      { ...base, id: "hidden", title: "隐藏内容不应出现", hidden: true },
    );
    await indexedDbRepository.save(workspace);
  });
  await page.reload();
  await page.locator(".overview-page").waitFor();
  await page.locator(".sidebar").getByRole("button", { name: "聚合块", exact: true }).click();
  await waitForCount(3);
  assert.match(await page.locator(".sidebar").getByRole("button", { name: "聚合块", exact: true }).innerText(), /3/);
  assert.equal(await page.getByText("隐藏内容不应出现", { exact: true }).count(), 0);
  await selectProject();
  await assertLayout("desktop");
  await screenshot("aggregate-desktop");

  await page.getByRole("button", { name: "收起聚合块列表", exact: true }).click();
  assert.equal(await directory.isVisible(), false);
  await assertLayout("desktop collapsed");
  await screenshot("aggregate-desktop-collapsed");
  await search.fill("指标 项目 ＳＴＡＲ");
  await waitForCount(1);
  assert.equal(await directory.isVisible(), true, "search reveals results after collapse");
  await search.press("Escape");
  await waitForCount(3);
  assert.equal(await search.inputValue(), "");
  assert.equal(await search.evaluate((element) => element === document.activeElement), true);

  await search.fill("不存在的关键词");
  await page.getByRole("heading", { name: "没有匹配的聚合块", exact: true }).waitFor();
  await page.getByRole("button", { name: "清除搜索", exact: true }).click();
  await waitForCount(3);
  await search.fill("复盘");
  await page.getByRole("button", { name: "清除聚合块搜索", exact: true }).click();
  await waitForCount(3);

  await page.getByRole("button", { name: "收起聚合块列表", exact: true }).click();
  await page.locator(".sync-scope-filter").getByRole("button", { name: "收藏", exact: true }).click();
  await waitForCount(1);
  assert.equal(await directory.isVisible(), true, "scope changes reveal the directory");
  await search.fill("项目");
  await page.getByRole("button", { name: "取消收藏聚合块", exact: true }).click();
  await page.getByRole("heading", { name: "还没有收藏的聚合块", exact: true }).waitFor();
  await page.getByRole("button", { name: "查看全部聚合块", exact: true }).click();
  await waitForCount(3);
  assert.equal(await search.inputValue(), "", "empty favorites recovery clears stale search");

  await selectProject();
  await page.getByRole("button", { name: "编辑回答", exact: true }).click();
  await page.getByRole("textbox", { name: "回答第 1 点", exact: true }).fill("先明确项目目标，再说明我负责的行动与结果。");
  await search.click();
  await page.getByRole("button", { name: "编辑复习笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "复习笔记", exact: true }).fill("下次补充指标与关键取舍。");
  await search.click();
  await page.getByRole("button", { name: "收藏聚合块", exact: true }).click();
  await page.locator(".linked-questions-toggle").click();
  await page.locator(".linked-questions-section .linked-question-row").waitFor();
  assert.ok(await page.locator(".sync-detail .linked-question-row").count() >= 2);

  await page.reload();
  await page.locator(".overview-page").waitFor();
  await page.locator(".sidebar").getByRole("button", { name: "聚合块", exact: true }).click();
  await selectProject();
  await page.getByText("下次补充指标与关键取舍。", { exact: true }).waitFor();
  assert.ok((await page.locator(".sync-body").innerText()).includes("先明确项目目标"));
  assert.equal(await page.getByRole("button", { name: "取消收藏聚合块", exact: true }).count(), 1);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await screenshot(`aggregate-mobile-${width}`);
    await assertLayout(`mobile ${width}`);
    await page.getByRole("button", { name: "收起聚合块列表", exact: true }).click();
    await assertLayout(`mobile ${width} collapsed`);
    await screenshot(`aggregate-mobile-${width}-collapsed`);
    await page.getByRole("button", { name: "展开聚合块列表", exact: true }).click();
  }

  const backup = await page.evaluate(async () => {
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    const { parseWorkspaceExport } = await import("/src/data/workspaceImport.ts");
    const data = indexedDbRepository.export(await indexedDbRepository.load());
    const restored = parseWorkspaceExport(JSON.stringify(data));
    return { version: data.formatVersion, blocks: restored.workspace.syncBlocks.length, compatible: "syncBlocks" in data };
  });
  assert.deepEqual(backup, { version: 10, blocks: 4, compatible: true });

  await page.evaluate(async () => {
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    const workspace = await indexedDbRepository.load();
    workspace.syncBlocks.forEach((block) => { block.hidden = true; });
    await indexedDbRepository.save(workspace);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.locator(".overview-page").waitFor();
  await page.locator(".sidebar").getByRole("button", { name: "聚合块", exact: true }).click();
  await page.getByRole("heading", { name: "还没有聚合块", exact: true }).waitFor();
  assert.equal(await search.count(), 0, "hidden-only workspaces have a usable empty state");
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, [], "no requests leave the isolated local test");
  console.log("PASS: aggregate-block search, filtering, persistence, backup compatibility and 1440/390/320px layouts");
} finally {
  await context.close();
  await browser.close();
}
