import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:43227";
const checkDir = process.env.SHARE_CHECK_DIR ?? "/tmp/atlas-share-check";
await mkdir(checkDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-mock-keychain", "--password-store=basic"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, reducedMotion: "reduce" });
const page = await context.newPage();
page.setDefaultTimeout(10_000);
const errors = [];
const externalRequests = [];
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin === new URL(appUrl).origin || ["data:", "blob:"].includes(url.protocol)) return route.continue();
  externalRequests.push(url.origin);
  return route.abort();
});
// Record real Canvas drawing calls to assert the content shown/exported.
await page.addInitScript(() => {
  window.__shareText = new WeakMap();
  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (...args) {
    const lines = window.__shareText.get(this.canvas) ?? [];
    lines.push({ text: args[0], font: this.font, x: args[1], y: args[2] });
    window.__shareText.set(this.canvas, lines);
    return fillText.apply(this, args);
  };
});
const dialog = page.getByRole("dialog");
const canvas = dialog.locator("canvas");
const text = () => canvas.evaluate((element) => window.__shareText.get(element).map((line) => line.text).join("\n"));
const bodyText = () => canvas.evaluate((element) => window.__shareText.get(element)
  .filter((line) => line.font.includes("32px")).map((line) => line.text).join(""));
const openShare = async (selector) => {
  await page.locator(selector).getByRole("button", { name: "分享", exact: true }).first().click();
  await canvas.waitFor();
};
const closeShare = () => dialog.getByRole("button", { name: "关闭", exact: true }).click();
const nav = (name) => page.locator(".sidebar").getByRole("button", { name, exact: true }).click();
const waitDrawing = (needle, present = true) => page.waitForFunction(({ needle, present }) => {
  const canvas = document.querySelector(".share-canvas-wrap canvas");
  const lines = canvas && window.__shareText.get(canvas);
  return Boolean(lines) && lines.some((line) => line.text.includes(needle)) === present;
}, { needle, present });
const pngCheck = async (download, prefix) => {
  assert.equal(await download.failure(), null);
  assert.match(download.suggestedFilename(), /\.png$/);
  const path = `${checkDir}/${prefix}-${download.suggestedFilename()}`;
  await download.saveAs(path);
  const bytes = await readFile(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), 1080);
  assert.equal(bytes.readUInt32BE(20), 1440);
  assert.ok(bytes.length > 10_000, "PNG includes drawn content");
};
const downloadOne = async (prefix) => {
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载图片", exact: true }).click();
  await pngCheck(await pending, prefix);
};
const geometryCheck = async (width) => {
  await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
  await canvas.waitFor();
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
  });
  const geometry = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const button = element.querySelector(".share-download-actions .primary").getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      left: bounds.left, right: bounds.right, bottom: bounds.bottom,
      buttonBottom: button.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight,
    };
  });
  assert.equal(geometry.overflow, false);
  assert.ok(geometry.left >= 0 && geometry.right <= geometry.viewportWidth + 1);
  assert.ok(geometry.bottom <= geometry.viewportHeight + 1 && geometry.buttonBottom <= geometry.viewportHeight + 1, JSON.stringify(geometry));
  await page.screenshot({ path: `${checkDir}/share-${width}.png`, fullPage: true });
};

try {
  await page.goto(appUrl);
  await page.locator(".overview-page").waitFor();
  const fixture = await page.evaluate(async () => {
    const { createDemoWorkspace } = await import("/src/data/demo.ts");
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    const workspace = createDemoWorkspace();
    const interview = workspace.interviews[0];
    const question = workspace.questions.find((item) => interview.questionIds.includes(item.id));
    question.title = "如何判断一个产品方案值得投入？";
    question.answer = "我会先明确业务问题与用户价值。\n再结合成本、指标和实验，判断方案是否值得投入。";
    question.notes = "笔记唯一标记：补充实验样本。";
    question.tags = ["分享测试标签"];
    const block = workspace.syncBlocks.find((item) => item.linkedQuestionIds.includes(question.id));
    block.title = "产品决策的判断依据";
    block.body = "围绕用户价值、实现成本与证据做判断。\n用小范围实验验证关键假设，再决定资源投入。";
    block.reviewNotes = "聚合笔记唯一标记";
    interview.rawText = "原文唯一标记\n" + "面试官与候选人的原始对话，逐字保留。".repeat(100);
    const resume = workspace.resumeExperiences[0];
    // Many aggregate sources, including multi-line titles, reproduce the reported layout.
    const provenanceQuestion = { ...question, id: "provenance-question", title: "关联原子问答不能出现在分享图中", sourceInterviewIds: [], linkedSyncBlockId: block.id };
    workspace.questions.push(provenanceQuestion);
    for (let index = 0; index < 16; index++) {
      const source = { ...interview, id: `provenance-${index}`, company: `来源企业 ${index + 1}`, role: "AI 产品经理 · 复杂多轮对话、用户记忆与模型策略方向".repeat(index % 3 + 1), round: "二面", questionIds: [provenanceQuestion.id] };
      workspace.interviews.push(source);
      provenanceQuestion.sourceInterviewIds.push(source.id);
    }
    const { buildShareDocument } = await import("/src/domain/share.ts");
    const sources = buildShareDocument({ kind: "aggregate", id: block.id }, workspace).sources;
    await indexedDbRepository.save(workspace);
    return { questionTitle: question.title, blockTitle: block.title, resumeTitle: resume.title, company: interview.company, rawText: interview.rawText, sources, snapshot: JSON.stringify(workspace) };
  });
  await page.reload();
  await page.locator(".overview-page").waitFor();
  // IndexedDB returns rows in primary-key order; compare against the loaded baseline.
  const loadedFixture = await page.evaluate(async () => {
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    const { buildShareDocument } = await import("/src/domain/share.ts");
    const loaded = await indexedDbRepository.load();
    const block = loaded.syncBlocks.find((item) => item.title === "产品决策的判断依据");
    // Provenance follows the loaded workspace order, as does the actual UI.
    return { snapshot: JSON.stringify(loaded), sources: buildShareDocument({ kind: "aggregate", id: block.id }, loaded).sources };
  });
  Object.assign(fixture, loadedFixture);

  await nav("原子问答");
  await page.locator(".question-list-row").filter({ hasText: fixture.questionTitle }).click();
  await openShare(".question-detail-page");
  assert.match(await text(), /如何判断一个产品方案值得投入/);
  assert.match(await text(), /再结合成本、指标和实验/);
  assert.equal((await text()).includes(fixture.company), false);
  assert.equal((await text()).includes("笔记唯一标记"), false);
  assert.doesNotMatch(await text(), /知识札记|原子问答|INTERVIEW ATLAS|见字|github\.com|01 \/ 01/);
  assert.equal(await dialog.getByRole("checkbox", { name: /^产品水印/ }).isChecked(), false);
  for (const width of [1440, 390, 320]) await geometryCheck(width);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await downloadOne("atomic");
  await dialog.getByRole("checkbox", { name: /^产品水印/ }).check();
  await waitDrawing("https://github.com/an-an-618/interview-atlas");
  assert.ok((await text()).includes("「见字·如面」提供制图支持"));
  assert.ok((await text()).includes("产品地址：https://github.com/an-an-618/interview-atlas"));
  assert.doesNotMatch(await text(), /01 \/ 01/);
  await downloadOne("atomic-watermark");
  await dialog.getByRole("checkbox", { name: /^产品水印/ }).uncheck();
  await waitDrawing("github.com", false);
  assert.doesNotMatch(await text(), /见字/);
  await dialog.getByRole("checkbox", { name: /^来源面试/ }).check();
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".share-canvas-wrap canvas");
    return window.__shareText.get(canvas)?.some((line) => line.text === "来源面试");
  });
  assert.ok((await text()).includes(fixture.company));
  assert.equal((await text()).includes("更新于"), false, "source and time toggles are independent");
  await dialog.getByRole("checkbox", { name: /^时间信息/ }).check();
  await dialog.getByRole("checkbox", { name: /^标签/ }).check();
  await dialog.getByRole("checkbox", { name: /^笔记/ }).check();
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".share-canvas-wrap canvas");
    return window.__shareText.get(canvas)?.some((line) => line.text.includes("笔记唯一标记"));
  });
  assert.match(await text(), /更新于/);
  assert.match(await text(), /分享测试标签/);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(await page.locator(".question-detail-page .share-trigger").evaluate((element) => element === document.activeElement), true);

  await nav("聚合块");
  await page.locator(".sync-list-select").filter({ hasText: fixture.blockTitle }).click();
  await openShare(".sync-detail");
  assert.match(await text(), /围绕用户价值/);
  assert.equal((await text()).includes(fixture.questionTitle), false);
  await downloadOne("aggregate");
  await dialog.getByRole("checkbox", { name: /^来源面试/ }).check();
  await waitDrawing("来源面试");
  const sourceCount = Number((await dialog.locator(".share-preview-toolbar").innerText()).match(/(\d+) 张图片/)[1]);
  assert.ok(sourceCount > 1);
  let allSources = "";
  for (let index = 0; index < sourceCount; index++) {
    if (index) {
      await dialog.getByRole("button", { name: "下一张图片", exact: true }).click();
      await dialog.locator(".share-pagination").getByText(`${index + 1} / ${sourceCount}`, { exact: true }).waitFor();
    }
    const drawn = await canvas.evaluate((element) => window.__shareText.get(element));
    const sources = drawn.filter((line) => line.font.includes("26px"));
    assert.ok(sources.length > 0);
    assert.ok(drawn.some((line) => line.text.startsWith("来源面试")));
    assert.ok(sources.every((line) => line.x === 140 && line.y + 37 <= 1300));
    allSources += sources.map((line) => line.text).join("");
    assert.equal((await text()).includes("关联原子问答不能出现在分享图中"), false);
    await canvas.evaluate(async (element) => {
      const { createShareMeasure } = await import("/src/platform/shareImage.ts");
      const measure = createShareMeasure();
      for (const line of window.__shareText.get(element).filter((item) => item.font.includes("26px"))) {
        if (measure(line.text, "source") > 852) throw new Error("source text exceeds hanging-indent width");
      }
    });
    if (index === 1) {
      const pending = page.waitForEvent("download");
      await dialog.getByRole("button", { name: "下载当前页", exact: true }).click();
      await pngCheck(await pending, "aggregate-sources");
    }
  }
  assert.equal(allSources, fixture.sources.join(""), "all source interviews are drawn without losing text");
  await page.screenshot({ path: `${checkDir}/share-aggregate.png`, fullPage: true });
  await closeShare();

  await nav("简历经历");
  const resumeCard = page.locator(".resume-card").filter({ hasText: fixture.resumeTitle });
  await resumeCard.getByRole("button", { name: "分享", exact: true }).click();
  await canvas.waitFor();
  assert.ok((await text()).includes(fixture.resumeTitle));
  await downloadOne("resume");
  await closeShare();
  await resumeCard.getByRole("button", { name: "编辑", exact: true }).click();
  await resumeCard.locator(".resume-bullet-editor").fill("尚未保存的草稿");
  assert.equal(await resumeCard.getByRole("button", { name: "分享", exact: true }).isEnabled(), false);
  await resumeCard.getByText("应用修改后即可分享最新经历。", { exact: true }).waitFor();

  await nav("面试记录");
  await page.locator(".interview-open").filter({ hasText: fixture.company }).first().click();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const position = await page.locator(".interview-detail-hero").evaluate((hero) => {
      const area = hero.getBoundingClientRect();
      const button = hero.querySelector(".interview-hero-share").getBoundingClientRect();
      return { top: button.top - area.top, right: area.right - button.right, inside: button.left >= area.left };
    });
    assert.ok(position.top >= 20 && position.top < 60 && Math.abs(position.right) < 1 && position.inside, JSON.stringify(position));
    await page.screenshot({ path: `${checkDir}/interview-hero-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openShare(".interview-detail-hero");
  assert.ok((await text()).includes(fixture.questionTitle));
  assert.equal((await text()).includes("原文唯一标记"), false);
  await dialog.getByRole("checkbox", { name: /^原始面试记录/ }).check();
  await dialog.getByText(/内容较长，已自动排成/).waitFor();
  const count = Number((await dialog.locator(".share-preview-toolbar").innerText()).match(/(\d+) 张图片/)[1]);
  assert.ok(count > 1);
  let combined = await text();
  let combinedBody = await bodyText();
  for (let index = 1; index < count; index++) {
    await dialog.getByRole("button", { name: "下一张图片", exact: true }).click();
    await dialog.locator(".share-pagination").getByText(`${index + 1} / ${count}`, { exact: true }).waitFor();
    combined += await text();
    combinedBody += await bodyText();
    assert.ok((await text()).includes(`${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`));
  }
  assert.match(combined, /原文唯一标记/);
  assert.ok(combinedBody.endsWith(fixture.rawText.replace(/\n/gu, "")), "the full raw record is drawn across all pages without losing characters");
  const onePage = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载当前页", exact: true }).click();
  await pngCheck(await onePage, "interview-last");
  await dialog.getByText(/已发起图片下载/).waitFor();

  const downloads = [];
  let resolveComplete;
  const complete = new Promise((resolve) => { resolveComplete = resolve; });
  const listener = (download) => {
    downloads.push(download);
    if (downloads.length === count) resolveComplete();
  };
  page.on("download", listener);
  await dialog.getByRole("button", { name: `下载全部 ${count} 张`, exact: true }).click();
  const timeout = setTimeout(() => resolveComplete(), 10_000);
  await complete;
  clearTimeout(timeout);
  page.off("download", listener);
  assert.equal(downloads.length, count, "all pages download");
  for (let index = 0; index < downloads.length; index++) {
    assert.match(downloads[index].suggestedFilename(), new RegExp(`-${String(index + 1).padStart(2, "0")}of${String(count).padStart(2, "0")}\\.png$`));
    await pngCheck(downloads[index], "interview");
  }
  await closeShare();
  await page.locator(".question-block").first().getByRole("button", { name: "分享", exact: true }).click();
  await canvas.waitFor();
  assert.ok((await text()).includes(fixture.questionTitle));
  await closeShare();
  const snapshot = await page.evaluate(async () => {
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    return JSON.stringify(await indexedDbRepository.load());
  });
  assert.deepEqual(JSON.parse(snapshot), JSON.parse(fixture.snapshot), "sharing does not change workspace content");
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log(`PASS: all four share targets; source/time/notes/tags/raw/watermark controls; clean atomic header and single-page footer; ${sourceCount}-page indented source list; ${count}-page interview preview and downloads; real 1080x1440 PNGs; 1440/390/320px layouts and top-right share button; local-only, unchanged workspace.`);
} finally {
  await context.close();
  await browser.close();
}
