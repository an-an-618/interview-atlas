import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.ATLAS_URL || "http://127.0.0.1:43118";
const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const output = process.env.ATLAS_QA_OUTPUT || "/tmp/atlas-responsive-qa";
await mkdir(output, { recursive: true });
async function seed(page) {
  await page.evaluate(async () => {
    const w = (await import("/src/data/demo.ts")).createDemoWorkspace();
    for (let i = 1; i < 8; i++) w.syncBlocks.push({ ...w.syncBlocks[0], id: `card-${i}`, title: i === 1 ? "在样本有限、来源不同、目标需要兼顾多个维度时，如何判断结论的可靠性？" + "请说明目标、约束、证据与实际结果。".repeat(20) : `练习 ${i}：如何保留真实的回答依据？`,
      body: "说明目标、行动与结果。\n" + "完整长内容，需要能在卡片内部继续阅读。".repeat(100), linkedQuestionIds: [] });
    await (await import("/src/data/repository.ts")).indexedDbRepository.save(w); sessionStorage.clear();
  });
  await page.reload();
  await page.locator(".workbench-home").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
const nav = (page, name) => page.getByRole("navigation", { name: "一级导航" }).getByRole("button", { name, exact: true }).click();
const current = page => page.locator(".review-card-active").getAttribute("data-card-id");
const settled = page => page.waitForFunction(() => !document.querySelector(".review-card-stack.is-turning"));
const geometry = page => page.evaluate(() => {
  const stage = document.querySelector(".review-stage")?.getBoundingClientRect(), card = document.querySelector(".review-card-active")?.getBoundingClientRect();
  return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, stage: stage?.toJSON(), card: card?.toJSON(), dpr: devicePixelRatio };
});
const result = [];
const browser = await chromium.launch({ executablePath: chrome, args: ["--use-mock-keychain", "--password-store=basic"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await page.goto(base); await seed(page);
  for (const width of [320, 390, 650, 900, 1150, 1440]) {
    await page.setViewportSize({ width, height: width < 1000 ? 844 : 1000 });
    await nav(page, "首页");
    const shape = await geometry(page);
    assert.equal(shape.overflow, false, `home overflow ${width}`);
    assert.ok(shape.card.height > shape.card.width * 1.35, `portrait ${width}`);
    assert.ok(shape.card.top >= shape.stage.top - 2 && shape.card.bottom <= shape.stage.bottom + 2, `card clipped ${width}: ${JSON.stringify(shape)}`);
    const original = await current(page);
    await page.getByRole("button", { name: "下一张卡片", exact: true }).click(); await settled(page);
    assert.notEqual(await current(page), original);
    await page.locator(".review-stage").focus(); await page.keyboard.press("ArrowLeft"); await settled(page);
    assert.equal(await current(page), original);
    await page.locator(".review-stage").evaluate(el => el.dispatchEvent(new WheelEvent("wheel", { deltaX: 120, deltaY: 0, bubbles: true, cancelable: true })));
    await page.waitForFunction(id => document.querySelector(".review-card-active")?.getAttribute("data-card-id") !== id, original);
    await settled(page); assert.notEqual(await current(page), original);
    const beforeSwipe = await current(page);
    await page.locator(".review-stage").scrollIntoViewIfNeeded();
    const touchBox = await page.locator(".review-stage").boundingBox();
    const x = touchBox.x + touchBox.width / 2, y = touchBox.y + touchBox.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 17 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 60, y, id: 17 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 110, y, id: 17 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(id => document.querySelector(".review-card-active")?.getAttribute("data-card-id") !== id, beforeSwipe);
    await page.getByRole("button", { name: "翻转卡片查看答案", exact: true }).click();
    const selected = await current(page);
    await nav(page, "练习");
    assert.equal(await current(page), selected);
    assert.equal(await page.locator(".review-card-active .review-flipper").evaluate(el => el.classList.contains("is-flipped")), true);
    await page.getByRole("button", { name: "查看详情", exact: true }).click();
    await page.getByRole("button", { name: "返回上次位置", exact: true }).click();
    assert.equal(await current(page), selected);
    await nav(page, "首页");
    // Each entrance keeps the same card and face; shuffle still settles to a usable portrait card.
    await page.getByRole("button", { name: "洗牌", exact: true }).click();
    await page.waitForSelector(".review-stage.is-shuffling-orbit");
    const bounds = await page.evaluate(async () => {
      const samples = [];
      for (let i = 0; i < 40 && document.querySelector(".is-shuffling-orbit"); i++) {
        const stage = document.querySelector(".review-stage").getBoundingClientRect();
        const visible = [...document.querySelectorAll(".review-card-active")];
        samples.push(visible.every(el => { const r = el.getBoundingClientRect(); return r.top >= stage.top - 2 && r.bottom <= stage.bottom + 2 && r.left >= stage.left - 2 && r.right <= stage.right + 2; }));
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return samples;
    });
    await page.waitForFunction(() => !document.querySelector(".review-stage.is-shuffling-orbit"));
    assert.ok(bounds.every(Boolean), `shuffle cropped ${width}`);
    assert.equal((await geometry(page)).overflow, false);
    result.push({ width, portrait: true, buttonsKeyboardWheelSwipe: true, sharedCardAndFace: true, shuffleInsideStage: true });
  }
  const before = await browser.newPage({ viewport: { width: 1568, height: 1002 } });
  await before.goto("http://127.0.0.1:43119");
  await before.locator(".overview-page").waitFor();
  await before.evaluate(async () => {
    await (await import("/src/data/repository.ts")).indexedDbRepository.save((await import("/src/data/demo.ts")).createDemoWorkspace());
  });
  await before.reload(); await before.evaluate(() => document.fonts.ready);
  await before.screenshot({ path: `${output}/2.0-首页-桌面.png`, fullPage: true, animations: "disabled" });
  await before.setViewportSize({ width: 390, height: 844 });
  await before.screenshot({ path: `${output}/2.0-首页-手机.png`, fullPage: true, animations: "disabled" });
} finally { await browser.close(); }
// Real Chrome host zoom: set Chromium Preferences before launch. DPR and CSS width confirm it applied.
for (const zoom of [.75, 1, 1.25, 1.5, 1.75, 2]) {
  const profile = await mkdtemp("/tmp/atlas-workspace-zoom-");
  await mkdir(`${profile}/Default`);
  const level = Math.log(zoom) / Math.log(1.2);
  await writeFile(`${profile}/Default/Preferences`, JSON.stringify({ partition: {
    default_zoom_level: { x: level }, per_host_zoom_levels: { x: { "127.0.0.1": {
      zoom_level: level, last_modified: String(BigInt(Date.now()) * 1000n + 11644473600000000n),
    } } },
  } }));
  const context = await chromium.launchPersistentContext(profile, { executablePath: chrome, headless: true, viewport: null,
    args: ["--use-mock-keychain", "--password-store=basic", "--window-size=1440,1000"] });
  try {
    const page = context.pages()[0]; await page.goto(base); await seed(page);
    const ratio = await page.evaluate(() => devicePixelRatio);
    assert.ok(Math.abs(ratio - zoom) < .02, `actual browser zoom ${zoom} received DPR ${ratio}`);
    for (const name of ["首页", "整理", "知识库", "练习"]) {
      await nav(page, name);
      assert.equal((await geometry(page)).overflow, false, `${name} at real zoom ${zoom}`);
    }
    result.push({ actualBrowserZoom: zoom, dpr: ratio, allFourPagesWithoutOverflow: true });
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
}
await writeFile(`${output}/响应式验收.json`, JSON.stringify({ passed: true, result }, null, 2));
console.log("PASS", result);
