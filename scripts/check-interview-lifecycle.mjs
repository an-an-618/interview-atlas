// Run against a Vite server with an isolated browser context and synthetic data.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = process.env.CHROME_CDP
  ? await chromium.connectOverCDP(process.env.CHROME_CDP)
  : await chromium.launch({
      executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--use-mock-keychain", "--password-store=basic"],
    });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
page.setDefaultTimeout(10_000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const nav = (name) => page.locator(".sidebar").getByRole("button", { name, exact: false }).click();
const stored = () => page.evaluate(async () => (await import("/src/data/repository.ts")).indexedDbRepository.load());
try {
  await page.goto(process.env.APP_URL ?? "http://127.0.0.1:43225");
  await page.locator(".overview-page").waitFor();
  await page.locator(".sidebar").getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("button", { name: /导入面经/ }).click();
  await page.getByLabel("面试原文", { exact: true }).fill("发言人 1\n00:00 请介绍一下你自己。");
  assert.equal(await page.getByLabel("公司名", { exact: true }).inputValue(), "未命名面试");
  await page.getByLabel("公司名", { exact: true }).fill("手动填写公司");
  await page.getByLabel("岗位名", { exact: true }).fill("产品经理");
  await page.getByLabel("面试原文", { exact: true }).fill("发言人 1\n00:00 请介绍一下你自己。\n答：测试回答。");
  assert.equal(await page.getByLabel("公司名", { exact: true }).inputValue(), "手动填写公司");
  await page.getByRole("button", { name: "保存并稍后审核", exact: true }).click();
  await page.locator(".import-modal").waitFor({ state: "detached" });
  assert.equal((await stored()).interviews[0].company, "手动填写公司");

  const ids = await page.evaluate(async () => {
    const domain = await import("/src/domain/workspace.ts");
    const { indexedDbRepository: repo } = await import("/src/data/repository.ts");
    const record = domain.addInterview(domain.emptyWorkspace(), {
      company: "编辑验证公司", role: "原岗位", round: "一面", date: "2026-10-01",
      source: "某来源文件.docx | 本地导入", rawText: "保留的原始面经",
    });
    const question = domain.addQuestion(record.workspace, record.interview.id, {
      title: "原问题", answer: "原答案", notes: "原笔记", tags: ["原标签"],
    });
    const standalone = domain.addStandaloneQuestion(question.workspace, { title: "独立问题", answer: "无关答案", tags: [] });
    const block = domain.addSyncBlock(standalone.workspace, {
      title: "保留同步块", body: "保留稳定回答", reviewNotes: "保留复习笔记",
      questionIds: [question.question.id, standalone.question.id], resumeExperienceIds: [],
    });
    const resume = domain.addResumeExperience(block.workspace, {
      type: "项目", title: "保留经历", organization: "示例组织", period: "2026",
      bullets: ["保留经历正文"], linkedQuestionIds: [question.question.id],
      linkedSyncBlockIds: [block.syncBlock.id],
    });
    const other = domain.addInterview(resume.workspace, { ...record.interview, company: "保留公司" });
    await repo.save(other.workspace);
    return { interview: record.interview.id, question: question.question.id, standalone: standalone.question.id, block: block.syncBlock.id };
  });
  await page.reload();
  await page.locator(".overview-page").waitFor();
  await nav("面试记录");
  const row = page.locator(".interview-row").filter({ hasText: "编辑验证公司" });
  assert.ok(!(await row.innerText()).includes(".docx"), "source filename stays out of list subtitle");
  await row.locator(".interview-open").click();
  await page.getByRole("button", { name: "编辑基础信息", exact: true }).click();
  await page.getByLabel("公司名", { exact: true }).fill("修改后公司");
  await page.getByLabel("岗位名", { exact: true }).fill("AI 产品经理");
  await page.getByLabel("面试轮次", { exact: true }).fill("二面");
  await page.getByRole("button", { name: "保存基础信息", exact: true }).click();
  await page.getByRole("heading", { name: /修改后公司.*AI 产品经理/ }).waitFor();
  await page.getByRole("button", { name: "编辑原子问答：原问题", exact: true }).click();
  await page.getByLabel("问题", { exact: true }).fill("修改后问题");
  await page.getByLabel("回答第 1 点", { exact: true }).fill("修改后答案");
  await page.getByLabel("笔记", { exact: true }).fill("修改后笔记");
  await page.getByLabel("标签", { exact: true }).fill("标签甲，标签乙");
  await page.getByRole("button", { name: "保存原子问答", exact: true }).click();
  assert.match(await page.locator(".question-block").innerText(), /修改后问题[\s\S]*修改后答案[\s\S]*修改后笔记/);
  await nav("原子问答");
  await page.getByText("修改后问题", { exact: true }).click();
  assert.match(await page.locator(".question-document").innerText(), /修改后答案[\s\S]*修改后笔记/);
  let saved = await stored();
  assert.equal(saved.interviews.find((item) => item.id === ids.interview).rawText, "保留的原始面经");
  assert.equal(saved.syncBlocks[0].body, "保留稳定回答");
  await page.reload();
  await page.locator(".overview-page").waitFor();
  await nav("面试记录");
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/interview-list-desktop.png` });

  // A failed transaction must leave the record visible and allow retry.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      if (this.name === "interview-atlas" && args[1] === "readwrite") {
        IDBDatabase.prototype.transaction = original;
        throw new Error("测试：磁盘保存失败");
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "删除面试记录：修改后公司", exact: true }).click();
  assert.match(await page.locator(".modal").innerText(), /1 个原子问答/);
  await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) =>
    animation.effect?.getTiming().iterations !== Infinity,
  ).map((animation) => animation.finished.catch(() => {}))));
  if (process.env.SCREENSHOT_DIR) await page.screenshot({
    path: `${process.env.SCREENSHOT_DIR}/interview-delete-desktop.png`, animations: "disabled",
  });
  await page.getByRole("button", { name: "确认永久删除", exact: true }).click();
  await page.locator(".modal").getByRole("alert").waitFor();
  assert.ok((await stored()).interviews.some((item) => item.id === ids.interview));
  await page.locator(".modal").getByRole("button", { name: "取消", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "mobile has no horizontal overflow");
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/interview-list-mobile.png` });
  await page.locator(".interview-row").filter({ hasText: "修改后公司" }).locator(".interview-open").click();
  await page.getByRole("button", { name: "编辑基础信息", exact: true }).click();
  await page.getByLabel("岗位名", { exact: true }).fill("移动端编辑岗位");
  await page.getByRole("button", { name: "保存基础信息", exact: true }).click();
  await page.getByRole("button", { name: "编辑原子问答：修改后问题", exact: true }).click();
  await page.getByLabel("回答第 1 点", { exact: true }).fill("移动端编辑答案");
  await page.getByRole("button", { name: "保存原子问答", exact: true }).click();
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/interview-detail-mobile.png`, fullPage: true });
  await page.locator(".interview-detail-nav").getByRole("button", { name: /返回/ }).click();
  await page.getByRole("button", { name: "删除面试记录：修改后公司", exact: true }).click();
  await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) =>
    animation.effect?.getTiming().iterations !== Infinity,
  ).map((animation) => animation.finished.catch(() => {}))));
  if (process.env.SCREENSHOT_DIR) await page.screenshot({
    path: `${process.env.SCREENSHOT_DIR}/interview-delete-mobile.png`, animations: "disabled",
  });
  await page.locator(".modal").getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(await page.locator(".interview-row").count(), 2);
  await page.getByRole("button", { name: "删除面试记录：修改后公司", exact: true }).click();
  await page.getByRole("button", { name: "确认永久删除", exact: true }).click();
  await page.locator(".modal").waitFor({ state: "detached" });
  await page.reload();
  await page.locator(".overview-page").waitFor();
  saved = await stored();
  assert.equal(saved.interviews.length, 1);
  assert.equal(saved.interviews[0].company, "保留公司");
  assert.deepEqual(saved.questions.map((item) => item.id), [ids.standalone]);
  assert.deepEqual(saved.syncBlocks[0].linkedQuestionIds, [ids.standalone]);
  assert.equal(saved.syncBlocks[0].body, "保留稳定回答");
  assert.deepEqual(saved.resumeExperiences[0].linkedQuestionIds, []);
  assert.deepEqual(saved.resumeExperiences[0].linkedSyncBlockIds, [ids.block]);
  assert.deepEqual(saved.resumeExperiences[0].bullets, ["保留经历正文"]);
  assert.deepEqual(errors, []);
  console.log("PASS: import metadata / desktop & mobile editing / shared question / reload / delete cancel / persistence failure / confirmed cascade / unrelated content preserved");
} catch (error) {
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/failure.png` });
  console.error(await page.locator(".modal").allTextContents());
  throw error;
} finally {
  await context.close();
  await browser.close();
}
