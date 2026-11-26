import assert from "node:assert/strict";
import { join } from "node:path";
import { webkit } from "playwright";
import { screenshotPixels } from "./png-pixels.mjs";

const browser = await webkit.launch();
const errors = [];
try {
  const cases = [1440, 768, 390, 320].flatMap(width =>
    ["reduce", "no-preference"].map(reducedMotion => ({ width, reducedMotion })));
  for (const { width, reducedMotion } of cases) {
    const context = await browser.newContext({
      viewport: { width, height: width <= 390 ? 844 : 1000 },
      hasTouch: width <= 768, isMobile: width <= 390, reducedMotion,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(process.env.APP_URL ?? "http://127.0.0.1:43119");
    await page.locator(".workspace-global-header").waitFor();
    await page.evaluate(async () => {
      await (await import("/src/data/repository.ts")).indexedDbRepository
        .save((await import("/src/data/demo.ts")).createDemoWorkspace());
      sessionStorage.clear();
    });
    await page.reload();
    const nav = name => page.getByRole("navigation", { name: "一级导航" })
      .getByRole("button", { name, exact: true }).click();
    for (const name of ["首页", "面试记录", "原子问答", "聚合块", "简历经历", "练习"]) {
      await nav(name);
      await page.evaluate(async () => {
        for (const animation of document.getAnimations()) {
          if (animation.effect?.getTiming().iterations !== Infinity) await animation.finished.catch(() => {});
        }
      });
      const geometry = await page.evaluate(() => ({
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        header: document.querySelector(".workspace-global-header").getBoundingClientRect().top,
      }));
      assert.ok(geometry.scrollWidth <= geometry.width + 1, `WebKit ${width}/${name}: horizontal overflow`);
      assert.equal(geometry.header, 0, `WebKit ${width}/${name}: header position`);
      if (process.env.SCREENSHOT_DIR && ["首页", "聚合块"].includes(name)) {
        await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, `webkit-${width}-${reducedMotion}-${name}.png`), fullPage: true });
      }
    }
    await nav("首页");
    assert.equal(await page.locator(".review-card-active .review-card-back").evaluate(e => getComputedStyle(e).visibility), "hidden", "WebKit must not paint reversed answer on the question face");
    await page.locator(".review-card-active .review-card-front .review-flip-button").click();
    await page.waitForFunction(() => document.querySelector(".review-card-active .review-flipper")?.classList.contains("is-flipped"));
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".review-card-active .review-card-front")).visibility === "hidden"
      && getComputedStyle(document.querySelector(".review-card-active .review-card-back")).visibility === "visible");
    await page.evaluate(async () => {
      await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const faceState = await page.locator(".review-card-active").evaluate(e => ({
      flipped: new DOMMatrix(getComputedStyle(e.querySelector(".review-flipper")).transform).m11,
      preservesDepth: getComputedStyle(e).transformStyle,
      filter: getComputedStyle(e).filter,
    }));
    assert.ok(faceState.flipped < -.99, `WebKit ${width}: flip reached 180 degrees`);
    assert.equal(faceState.preservesDepth, "preserve-3d", "carousel card must preserve face transforms");
    assert.equal(faceState.filter, "none", "identity filter must not flatten the active card");
    // DOM visibility alone missed WebKit retaining blank text/SVG paint after
    // navigating away and back. Count ink within the actual paragraph bounds.
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    const rect = await page.locator(".review-card-active .answer-outline").evaluate(e => {
      const r = e.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
    });
    const paintedAnswer = await page.screenshot({ fullPage: true });
    assert.ok(screenshotPixels(paintedAnswer).darkPixels(rect) > 100, `WebKit ${width}: answer text must actually paint`);
    const hiddenDescendants = await page.locator(".review-card-active .review-card-back").evaluate(e =>
      [...e.querySelectorAll("*")].filter(n => getComputedStyle(n).visibility !== "visible").map(n => n.tagName));
    assert.deepEqual(hiddenDescendants, [], `WebKit ${width}: answer icons and descendants must be visible`);
    for (const face of ["back", "front"]) {
      await page.locator(`.review-card-active .review-card-${face} .review-flip-button`).click();
      await page.waitForFunction(expected => {
        const e = document.querySelector(".review-card-active .review-flipper");
        return e.classList.contains("is-flipped") === expected
          && getComputedStyle(e.querySelector(`.review-card-${expected ? "back" : "front"}`)).visibility === "visible";
      }, face === "front");
      await page.evaluate(async () => {
        await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
    }
    assert.ok(screenshotPixels(await page.screenshot({ fullPage: true })).darkPixels(rect) > 100,
      `WebKit ${width}/${reducedMotion}: answer must paint after repeated flips`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    if(process.env.SCREENSHOT_DIR) await page.screenshot({ path:join(process.env.SCREENSHOT_DIR,`webkit-${width}-${reducedMotion}-answer.png`),fullPage:true });
    await nav("原子问答");
    await page.getByRole("button", { name: "新建原子问答", exact: true }).click();
    await page.getByRole("dialog").getByRole("textbox", { name: "问题", exact: true }).fill(`WebKit ${width} 保存检查`);
    await page.getByLabel("回答第 1 点", { exact: true }).fill("虚构测试回答，保存后应完整保留。");
    await page.getByRole("dialog").getByRole("button", { name: "添加原子问答", exact: true }).click();
    await page.getByRole("heading", { name: `WebKit ${width} 保存检查`, exact: true }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: `WebKit ${width} 保存检查`, exact: true }).waitFor();
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("PASS: WebKit desktop/tablet/phone at 1440/768/390/320px; normal/reduced motion, six modules, fixed header, repeated flips with actual answer pixels and save/reload persistence.");
} finally {
  await browser.close();
}
