import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:43118";
const executablePath = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = process.env.SCREENSHOT_DIR;
const args = ["--use-mock-keychain", "--password-store=basic"];
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const errors = [];
const inspectErrors = (page) => page.on("pageerror", (error) => errors.push(error.message));
const seed = async (page, empty = false) => {
  await page.evaluate(async (empty) => {
    const { createDemoWorkspace } = await import("/src/data/demo.ts");
    const { emptyWorkspace } = await import("/src/domain/workspace.ts");
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    const workspace = empty ? emptyWorkspace() : createDemoWorkspace();
    if (!empty) {
      workspace.syncBlocks[0].title = "如何证明，一次产品改动真的有效？";
      workspace.syncBlocks[0].updatedAt = "2026-11-11T08:00:00.000Z";
      workspace.interviews[0].updatedAt = "2026-11-10T08:00:00.000Z";
      workspace.questions[0].updatedAt = "2026-11-09T08:00:00.000Z";
      workspace.questions[1].favorite = true;
      workspace.interviews[0].extractionTask = {
        id: "home-pending-check", status: "failed", updatedAt: workspace.interviews[0].updatedAt,
        error: "示例待审核任务",
      };
      for (let i = 1; i < 6; i++) workspace.syncBlocks.push({
        ...workspace.syncBlocks[0], id: `home-block-${i}`, favorite: false,
        title: `聚合卡片 ${i}：如何在目标、约束和真实反馈之间，找到更好的判断依据？`,
        linkedQuestionIds: [],
        updatedAt: "2026-10-10T08:00:00.000Z",
      });
    }
    await indexedDbRepository.save(workspace);
  }, empty);
  await page.reload();
  await page.locator(".home-layout").waitFor();
  await page.evaluate(() => document.fonts.ready);
};
const home = async (page) => {
  if (await page.locator(".bottom-overview").isVisible()) await page.locator(".bottom-overview").click();
  else await page.locator(".sidebar").getByRole("button", { name: "主页", exact: true }).click();
  await page.locator(".home-layout").waitFor();
};
const shape = async (page) => {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() =>
    document.querySelector(".overview-page")?.getAnimations().every((animation) => animation.playState === "finished"),
  );
  return page.evaluate(() => {
    const bounds = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    const stage = document.querySelector(".review-stage");
    const active = document.querySelector(".review-card-active");
    return {
      width: innerWidth, dpr: devicePixelRatio,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      main: bounds(".home-main"), aside: bounds(".home-aside"),
      search: bounds(".home-search"), topbar: bounds(".home-topbar"),
      card: active?.getBoundingClientRect().toJSON(),
      stage: stage?.getBoundingClientRect().toJSON(), stageScroll: stage?.scrollTop,
    };
  });
};
const verifyShape = async (page, name) => {
  const layout = await shape(page);
  if (layout.overflow) {
    console.log(name, layout, await page.evaluate(() => [...document.querySelectorAll("main *")]
      .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 16).map((element) => ({
        className: element.className, right: element.getBoundingClientRect().right,
        width: element.getBoundingClientRect().width,
      }))));
    await screenshot(page, "overflow-failure", true);
  }
  assert.equal(layout.overflow, false, `${name}: no horizontal overflow`);
  assert.ok(layout.search.right <= layout.topbar.right + 1, `${name}: search stays inside header`);
  if (layout.card) {
    assert.ok(Math.abs(layout.card.width / layout.card.height - 2 / 3) < 0.01, `${name}: portrait proportion`);
    assert.ok(layout.card.left >= layout.stage.left && layout.card.right <= layout.stage.right, `${name}: current card fits horizontally`);
    assert.equal(layout.stageScroll, 0, `${name}: carousel does not scroll internally`);
  }
  return layout;
};
const screenshot = async (page, name, fullPage = false) => {
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, `${name}.png`), fullPage });
};

const browser = await chromium.launch({ executablePath, headless: true, args });
const sizes = [
  [320, 640], [375, 667], [390, 844], [600, 900], [760, 900], [768, 1024],
  [820, 1180], [960, 720], [1024, 768], [1280, 720], [1440, 1000],
  [1920, 1080], [2560, 1440], [844, 390],
];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  inspectErrors(page);
  await page.goto(appUrl);
  await page.locator(".home-layout").waitFor();
  await seed(page);
  for (let index = 0; index < 6 && await page.locator(".review-card-active").getAttribute("data-card-id") !== "sample-sync"; index++) {
    await page.getByRole("button", { name: "下一张卡片", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".review-card-stack.is-turning"));
  }
  const rows = await page.locator(".home-recent-row").allTextContents();
  assert.ok(rows[0].includes("聚合块") && rows[1].includes("面试记录") && rows[2].includes("原子问答"), "recent knowledge includes all types in update order");
  assert.equal(await page.locator(".home-favorite-list > button").count(), 2, "both kinds of favorites appear");
  assert.equal(await page.locator(".home-pending").count(), 1, "pending review remains reachable");
  await screenshot(page, "home-desktop", true);
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    const result = await verifyShape(page, `${width}x${height}`);
    if (width === 1440 || width === 1920 || width === 2560) assert.ok(result.aside.x > result.main.right, "wide workbench uses two columns");
    if (width === 320 || width === 390) assert.ok(result.aside.y > result.main.y, "phone workbench stacks sections");
    if ([320, 390, 768, 960, 1280, 2560].includes(width)) await screenshot(page, `home-${width}`, true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "收起侧边栏", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().width < 90);
  await verifyShape(page, "collapsed sidebar");
  const collapsedSidebar = await page.locator(".sidebar").evaluate((sidebar) => {
    const bounds = sidebar.getBoundingClientRect();
    const centre = bounds.left + bounds.width / 2;
    return {
      headings: [...sidebar.querySelectorAll(".nav-group:not(:last-child) > p")].map((heading) => ({
        height: heading.getBoundingClientRect().height,
        fontSize: getComputedStyle(heading).fontSize,
        padding: getComputedStyle(heading).padding,
        color: getComputedStyle(heading).color,
      })),
      iconOffsets: [...sidebar.querySelectorAll("nav button > svg, .sidebar-foot > svg")].map((icon) => {
        const box = icon.getBoundingClientRect();
        return Math.abs(box.left + box.width / 2 - centre);
      }),
    };
  });
  for (const heading of collapsedSidebar.headings) {
    assert.deepEqual(heading, { height: 1, fontSize: "0px", padding: "0px", color: "rgba(0, 0, 0, 0)" }, "collapsed group headings are fine rules without clipped text");
  }
  assert.ok(collapsedSidebar.iconOffsets.every((offset) => offset < 1), "collapsed navigation and footer icons share the sidebar centre");
  await screenshot(page, "home-sidebar-collapsed");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTitle("打开导航", { exact: true }).click();
  const mobileHeading = await page.locator(".sidebar .nav-group > p").first().evaluate((heading) => ({
    height: heading.getBoundingClientRect().height, fontSize: parseFloat(getComputedStyle(heading).fontSize),
  }));
  assert.ok(mobileHeading.height > 10 && mobileHeading.fontSize >= 12, "mobile navigation restores group labels despite the desktop collapsed preference");
  await screenshot(page, "home-sidebar-mobile");
  await page.locator(".sidebar .mobile-close").click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().width < 90);
  await page.getByRole("button", { name: "展开侧边栏", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().width > 240);
  await verifyShape(page, "expanded sidebar");
  await page.getByRole("searchbox", { name: "搜索你的知识库", exact: true }).fill("事件循环");
  await page.getByRole("searchbox", { name: "搜索你的知识库", exact: true }).press("Enter");
  await page.locator(".global-search-page").waitFor();
  assert.equal(await page.getByRole("textbox", { name: "全局搜索知识库", exact: true }).inputValue(), "事件循环", "home search passes its query");
  await home(page);
  await page.locator(".home-recent-row").first().getByRole("button").click();
  await page.locator(".sync-detail").waitFor();
  await home(page);
  await page.locator(".home-favorite-list > button").last().click();
  await page.locator(".question-detail-page").waitFor();
  await home(page);
  await page.getByRole("button", { name: "历史模拟", exact: true }).click();
  await page.locator(".mock-interview-lobby").waitFor();
  await home(page);
  await page.getByRole("button", { name: "进入面试间", exact: true }).click();
  await page.locator(".mock-setup-page").waitFor();
  await home(page);
  await page.locator(".home-pending button").first().click();
  await page.locator(".ai-review-page").waitFor();
  await home(page);
  await page.getByRole("button", { name: "查看全部", exact: true }).click();
  await page.locator(".global-search-page").waitFor();
  assert.equal(await page.getByRole("textbox", { name: "全局搜索知识库", exact: true }).inputValue(), "", "all knowledge opens without a stale search filter");
  await home(page);
  await seed(page, true);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await verifyShape(page, `empty-${width}`);
    assert.equal(await page.getByRole("button", { name: "新建第一条记录", exact: true }).count(), 1);
    const emptyBounds = await page.locator(".review-card-empty").boundingBox();
    const createBounds = await page.getByRole("button", { name: "创建聚合块", exact: true }).boundingBox();
    assert.ok(createBounds.y >= emptyBounds.y && createBounds.y + createBounds.height <= emptyBounds.y + emptyBounds.height, "empty-card action stays inside the card");
    await screenshot(page, `home-empty-${width}`, true);
  }
  console.log(`Home checked at ${sizes.length} window sizes: columns, sidebar, search, recent knowledge, favorites, pending review, interview entries and empty state.`);
} finally {
  await browser.close();
}

// Chrome's own zoom preference changes CSS viewport size and devicePixelRatio.
// Use an isolated profile so these checks never alter the user's browser.
for (const zoom of [0.75, 1, 1.25, 1.5, 2]) {
  const profile = await mkdtemp(join(tmpdir(), "atlas-home-zoom-"));
  await mkdir(join(profile, "Default"));
  const level = Math.log(zoom) / Math.log(1.2);
  await writeFile(join(profile, "Default", "Preferences"), JSON.stringify({
    partition: {
      default_zoom_level: { x: level },
      per_host_zoom_levels: { x: { [new URL(appUrl).hostname]: {
        zoom_level: level, last_modified: String(BigInt(Date.now()) * 1000n + 11644473600000000n),
      } } },
    },
  }));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath, headless: true, viewport: null, reducedMotion: "reduce",
    args: [...args, "--window-size=1440,1000"],
  });
  try {
    const page = context.pages()[0];
    inspectErrors(page);
    await page.goto(appUrl);
    await page.locator(".home-layout").waitFor();
    await seed(page);
    const result = await verifyShape(page, `Chrome zoom ${zoom * 100}%`);
    assert.ok(Math.abs(result.dpr - zoom) < 0.02, "Chrome zoom actually took effect");
    await page.getByRole("button", { name: "洗牌", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".review-hero").getAttribute("aria-busy") !== "true");
    await page.getByRole("button", { name: "翻转卡片查看答案", exact: true }).click();
    assert.equal(await page.locator(".review-card-active .review-flipper.is-flipped").count(), 1);
    await verifyShape(page, `Chrome zoom ${zoom * 100}% after interaction`);
    if (screenshotDir) {
      // Playwright's screenshot clip assumes an unzoomed viewport. Capture
      // Chrome's native surface to retain the actual browser zoom in pixels.
      const session = await context.newCDPSession(page);
      const shot = await session.send("Page.captureScreenshot", { format: "png" });
      await writeFile(join(screenshotDir, `home-zoom-${zoom * 100}.png`), Buffer.from(shot.data, "base64"));
      await session.detach();
    }
    console.log(`Chrome zoom ${zoom * 100}% verified: CSS width ${result.width}, DPR ${result.dpr}.`);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}
assert.deepEqual(errors, [], "no browser runtime errors");
