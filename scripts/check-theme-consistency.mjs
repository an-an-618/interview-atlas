import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:43118";
const executablePath = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const args = ["--use-mock-keychain", "--password-store=basic"];
const screenshotDir = process.env.SCREENSHOT_DIR;
const baseline = process.env.BASELINE === "1";
const errors = [];
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const pages = [
  ["主页", ".overview-page", "home"],
  ["全局搜索", ".global-search-page", "search"],
  ["模拟面试", ".mock-interview-lobby", "mock"],
  ["面试记录", ".interviews-page", "interviews"],
  ["原子问答", ".questions-page", "questions"],
  ["聚合块", ".sync-page", "aggregate"],
  ["简历经历", ".resume-page", "resume"],
  ["设置", ".settings-page", "settings"],
];
const seed = async (page) => {
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(appUrl);
  await page.locator(".home-layout").waitFor();
  await page.evaluate(async () => {
    const { createDemoWorkspace } = await import("/src/data/demo.ts");
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    await indexedDbRepository.save(createDemoWorkspace());
  });
  await page.reload();
  await page.locator(".home-layout").waitFor();
  await page.evaluate(() => document.fonts.ready);
};
const navigate = async (page, name, selector) => {
  const mobile = await page.locator(".mobile-header").isVisible();
  if (mobile) await page.getByTitle("打开导航", { exact: true }).click();
  await page.locator(".sidebar").getByRole("button", { name, exact: true }).click();
  await page.locator(selector).waitFor();
};
const capture = async (page, name) => {
  if (!screenshotDir) return;
  const path = join(screenshotDir, `${name}.png`);
  if (name.startsWith("zoom-")) {
    const session = await page.context().newCDPSession(page);
    const shot = await session.send("Page.captureScreenshot", { format: "png" });
    await writeFile(path, Buffer.from(shot.data, "base64"));
    await session.detach();
  } else await page.screenshot({ path, fullPage: true });
};
const check = async (page, name) => {
  if (baseline) return;
  await page.mouse.move(0, 0);
  // Navigation uses a short color transition; inspect its settled state.
  await page.waitForFunction(() =>
    !document.querySelector(".sidebar nav button.active") ||
    getComputedStyle(document.querySelector(".sidebar nav button.active")).backgroundColor === "rgb(229, 232, 221)",
    undefined, { timeout: 2000 },
  );
  await page.waitForFunction(() => [...document.querySelectorAll(".button.primary, .button.accent")]
    .filter((element) => element.getBoundingClientRect().width > 0)
    .every((element) => getComputedStyle(element).backgroundColor === "rgb(37, 68, 56)"),
    undefined, { timeout: 2000 },
  );
  const result = await page.evaluate(() => {
    const css = getComputedStyle(document.querySelector(".app-shell"));
    const visible = (element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
    return {
      paper: css.getPropertyValue("--paper").trim(),
      background: getComputedStyle(document.body).backgroundColor,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      primary: [...document.querySelectorAll(".button.primary, .button.accent")]
        .filter(visible).map((element) => ({
          label: element.textContent.trim(), background: getComputedStyle(element).backgroundColor,
        })),
      activeNav: document.querySelector(".sidebar nav button.active")
        ? getComputedStyle(document.querySelector(".sidebar nav button.active")).backgroundColor : null,
    };
  });
  assert.equal(result.paper, "#f8f5f0", `${name}: shared paper`);
  assert.equal(result.background, "rgb(248, 245, 240)", `${name}: body paper`);
  assert.equal(result.overflow, false, `${name}: no horizontal overflow`);
  if (result.activeNav) assert.equal(result.activeNav, "rgb(229, 232, 221)", `${name}: shared navigation selection`);
  for (const button of result.primary) assert.equal(button.background, "rgb(37, 68, 56)", `${name}: ${button.label}`);
};
const color = (locator, property = "backgroundColor") => locator.evaluate((element, property) => getComputedStyle(element)[property], property);
const waitColor = async (locator, expected, property = "backgroundColor") => {
  const element = await locator.elementHandle();
  await locator.page().waitForFunction(
    ({ element, expected, property }) => getComputedStyle(element)[property] === expected,
    { element, expected, property },
  );
};
const tour = async (page, label) => {
  for (const [name, selector, id] of pages) {
    await navigate(page, name, selector);
    await page.mouse.move(0, 0);
    await check(page, `${label}-${id}`);
    await capture(page, `${label}-${id}`);
  }
  await navigate(page, "主页", ".overview-page");
  await page.getByRole("button", { name: "进入面试间", exact: true }).click();
  await page.locator(".mock-setup-page").waitFor();
  await check(page, `${label}-mock-setup`);
  await capture(page, `${label}-mock-setup`);
  await navigate(page, "主页", ".overview-page");
  if (await page.locator(".mobile-header").isVisible()) await page.locator(".bottom-create").click();
  else await page.locator(".sidebar .import-button").click();
  await page.locator(".create-page").waitFor();
  await check(page, `${label}-create`);
  await capture(page, `${label}-create`);
  await page.locator(".create-mode-list > button").first().click();
  await page.locator(".import-workspace").waitFor();
  await check(page, `${label}-import`);
  await capture(page, `${label}-import`);
  if (!baseline && label === "desktop") {
    const disabled = page.locator(".import-workspace button.button:disabled").last();
    assert.ok(await disabled.count() > 0, "import cannot start without text");
    const before = await color(disabled);
    await disabled.hover();
    assert.equal(await color(disabled), before, "disabled action retains its color on hover");
    assert.equal(await color(disabled, "cursor"), "not-allowed", "disabled action explains unavailable state");
  }
};
const browser = await chromium.launch({ executablePath, headless: true, args });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await seed(page);
  await tour(page, "desktop");
  if (!baseline) {
    await navigate(page, "全局搜索", ".global-search-page");
    await page.getByRole("textbox", { name: "全局搜索知识库", exact: true }).fill("事件循环");
    assert.ok(await page.locator(".global-search-result").count() > 0, "search still returns results");
    await waitColor(page.locator(".global-search-box"), "rgb(37, 68, 56)", "borderTopColor");
    await page.locator(".global-search-scopes").getByRole("button", { name: /问答/ }).click();
    await page.locator(".global-search-result").first().click();
    await page.locator(".question-detail-page").waitFor();
    await check(page, "question detail");
    await capture(page, "desktop-question-detail");
    await navigate(page, "原子问答", ".questions-page");
    await page.locator(".questions-page .button.primary").click();
    await page.getByRole("dialog").waitFor();
    await check(page, "new question modal");
    await capture(page, "desktop-question-modal");
    const submit = page.locator(".modal button[type=submit]");
    await submit.click();
    assert.equal(await page.getByRole("dialog").isVisible(), true, "required title prevents empty submission");
    assert.equal(await page.locator(".modal input[required]").evaluate((element) => element.validity.valueMissing), true);
    await page.locator(".modal-header").getByTitle("关闭", { exact: true }).click();
    await navigate(page, "聚合块", ".sync-page");
    await page.locator(".sync-scope-filter button").last().click();
    await waitColor(page.locator(".sync-scope-filter button.active"), "rgb(229, 232, 221)");
    await page.locator(".sync-scope-filter button").first().click();
    const primary = page.locator(".sync-page .button.primary");
    await primary.hover();
    await waitColor(primary, "rgb(52, 87, 71)");
    const bounds = await primary.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await waitColor(primary, "rgb(25, 53, 42)");
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await page.keyboard.press("Tab");
    await primary.focus();
    assert.equal(await color(primary, "outlineStyle"), "solid", "keyboard focus is visible");
    await navigate(page, "设置", ".settings-page");
    const toggle = page.getByRole("switch").first();
    const wasChecked = await toggle.getAttribute("aria-checked");
    await toggle.click();
    assert.notEqual(await toggle.getAttribute("aria-checked"), wasChecked, "settings switch updates");
    if (wasChecked === "true") await toggle.click();
    await page.mouse.move(0, 0);
    await waitColor(page.locator(".settings-switch[aria-checked=true] .settings-switch-track"), "rgb(37, 68, 56)");
    await navigate(page, "面试记录", ".interviews-page");
    await page.locator(".interview-filter-trigger").click();
    await page.locator(".interview-filter-panel").waitFor();
    await capture(page, "desktop-filter");
    await page.locator(".interview-filter-trigger").click();
    await page.getByRole("button", { name: "收起侧边栏", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().width < 90);
    assert.equal(await page.locator(".nav-group > p").first().evaluate((element) => getComputedStyle(element).fontSize), "0px", "collapsed sidebar rules apply outside home");
    await capture(page, "desktop-collapsed");
    await page.getByRole("button", { name: "展开侧边栏", exact: true }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await tour(page, "mobile");
  if (!baseline) {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const [name, selector, id] of pages) {
      await navigate(page, name, selector);
      await check(page, `small-${id}`);
    }
  }
  console.log(`Shared theme ${baseline ? "baseline captured" : "verified"}: 8 pages, setup, create/import, desktop and mobile${baseline ? "" : ", search, modal, disabled/hover/pressed/focus, filters, switch and collapsed navigation"}.`);
} finally {
  await browser.close();
}

if (!baseline) for (const zoom of [0.75, 1, 1.25, 1.5, 2]) {
  const profile = await mkdtemp(join(tmpdir(), "atlas-theme-zoom-"));
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
    await seed(page);
    assert.ok(Math.abs(await page.evaluate(() => devicePixelRatio) - zoom) < 0.02, "native Chrome zoom applied");
    await tour(page, `zoom-${zoom * 100}`);
    console.log(`Shared theme at Chrome zoom ${zoom * 100}% verified.`);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}
assert.deepEqual(errors, [], "no browser runtime errors");
