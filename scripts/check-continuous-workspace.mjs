import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.ATLAS_URL || "http://127.0.0.1:43118";
const output = process.env.ATLAS_QA_OUTPUT || "/tmp/atlas-continuous-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--use-mock-keychain", "--password-store=basic"],
});
const context = await browser.newContext({ viewport: { width: 1568, height: 1002 } });
const page = await context.newPage();
page.setDefaultTimeout(12_000);
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("dialog", d => d.accept());
const nav = name => page.getByRole("navigation", { name: "一级导航" }).getByRole("button", { name, exact: true }).click();
const tab = name => page.getByRole("navigation", { name: "练习方式" }).getByRole("button", { name, exact: true }).click();
const load = () => page.evaluate(async () => (await import("/src/data/repository.ts")).indexedDbRepository.load());
const fault = () => page.evaluate(() => {
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    if (window.__failSave && args[1] === "readwrite") { window.__failSave = false; throw new Error("验收：写入失败"); }
    return original.apply(this, args);
  };
  window.__failSave = true;
});
const shot = name => page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
const checks = [];
try {
  await page.goto(base);
  await page.locator(".workbench-home").waitFor();
  // Fresh isolated browser context: the user's workspace and credentials are never touched.
  await nav("整理");
  await page.getByRole("button", { name: "导入面经", exact: true }).first().click();
  await page.getByRole("textbox", { name: "公司", exact: true }).fill("验收面经");
  const raw = "问题：你如何验证性能？\n回答：我保留对照组，在相同设备和网络下比较 LCP。\n\n问题：如何定位瓶颈？\n回答：用性能面板核对主线程任务。";
  await page.getByRole("textbox", { name: "面试原文", exact: true }).fill(raw);
  await fault();
  await page.getByRole("button", { name: "保存并进入整理", exact: true }).click();
  await page.getByRole("dialog").getByText("验收：写入失败", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "面试原文", exact: true }).inputValue(), raw);
  await page.getByRole("button", { name: "保存并进入整理", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await load()).interviews[0].rawText, raw);
  await page.reload();
  await page.locator(".organize-page").waitFor();
  await page.getByRole("button", { name: "手动添加问答", exact: true }).click();
  await page.getByPlaceholder("保留面试官的真实问题").fill("你如何验证性能？");
  await page.getByRole("textbox", { name: "回答第 1 点", exact: true }).fill("我保留对照组。");
  await page.getByRole("button", { name: "添加原子问答", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await load()).questions[0].sourceInterviewIds[0], (await load()).interviews[0].id);
  checks.push("空工作区：原文保存失败保留，重试后刷新与手动入库");
  await page.evaluate(async () => {
    const { createDemoWorkspace } = await import("/src/data/demo.ts");
    const r = (await import("/src/data/repository.ts")).indexedDbRepository;
    const w = createDemoWorkspace(), now = new Date().toISOString();
    const titles = ["如何验证性能优化的效果？", "如何定位性能瓶颈？", "方案选择上做了什么取舍？"];
    const answers = ["保留对照组，在相同设备和网络下比较 LCP。", "核对主线程任务和资源加载。", "按收益和成本安排优先级。"];
    w.interviews[0] = { ...w.interviews[0], status: "pending", updatedAt: now, rawText: titles.map((t, i) => `${t}\n${answers[i]}`).join("\n\n") };
    w.syncBlocks.push({ ...w.syncBlocks[0], id: "performance", title: "性能优化：从测量到验证", body: "先确认问题，再讨论方案。\n建立基线：按真实访问数据设定优化目标。\n定位并验证：核对资源与主线程任务。", linkedQuestionIds: [], updatedAt: now });
    w.resumeExperiences[0].linkedSyncBlockIds.push("performance");
    w.aiReviews = [{ id: "qa-review", interviewId: "sample-interview", createdAt: now, updatedAt: now,
      candidates: titles.map((title, i) => ({ id: `qa-candidate-${i}`, title, answer: answers[i], tags: ["性能"],
        sourceExcerpt: answers[i], suggestedSyncBlockId: "performance", matchReason: "围绕测量、验证和方案取舍。",
        questionDecision: "pending", syncDecision: "pending", createdQuestionId: null })) }];
    await r.save(w); sessionStorage.clear();
  });
  await page.reload();
  await page.locator(".workbench-home").waitFor();
  await shot("首页-桌面");
  await nav("整理");
  await shot("整理-桌面");
  await fault();
  await page.getByRole("button", { name: "采纳并继续", exact: true }).click();
  await page.getByText("验收：写入失败 待提交内容已保留。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "候选问题", exact: true }).inputValue(), "如何验证性能优化的效果？");
  await page.getByRole("button", { name: "采纳并继续", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="候选问题"]')?.value === "如何定位性能瓶颈？");
  await page.getByRole("button", { name: "采纳并继续", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="候选问题"]')?.value === "方案选择上做了什么取舍？");
  await nav("首页");
  await page.getByText(/已处理 2 \/ 3 条/).first().waitFor();
  await page.getByRole("button", { name: "继续核对", exact: true }).click();
  await page.reload();
  assert.equal(await page.getByRole("textbox", { name: "候选问题", exact: true }).inputValue(), "方案选择上做了什么取舍？");
  await page.locator(".candidate-directory").getByRole("button").first().click();
  await page.getByRole("button", { name: "确认关联", exact: true }).click();
  await page.getByText("已确认关联", { exact: true }).waitFor();
  await page.locator(".candidate-directory").getByRole("button").nth(1).click();
  await page.getByRole("button", { name: "忽略关联", exact: true }).click();
  await page.getByText("已忽略关联，问答仍保留。", { exact: true }).waitFor();
  const reviewed = await load();
  assert.equal(reviewed.questions.length, 4);
  assert.equal(reviewed.aiReviews[0].candidates[0].syncDecision, "accepted");
  assert.equal(reviewed.aiReviews[0].candidates[1].syncDecision, "ignored");
  assert.equal(reviewed.questions.find(q => q.id === reviewed.aiReviews[0].candidates[0].createdQuestionId).sourceExcerpt, reviewed.aiReviews[0].candidates[0].sourceExcerpt);
  checks.push("首页续办、候选位置刷新、独立关联确认与忽略、保留来源且不重复创建");
  await nav("知识库");
  await page.getByRole("navigation", { name: "知识库分类" }).getByRole("button", { name: "聚合块", exact: true }).click();
  await page.locator(".knowledge-object-list").getByRole("button").filter({ hasText: "性能优化：从测量到验证" }).click();
  await page.getByRole("textbox", { name: "回答第 1 点", exact: true }).fill("我的草稿：先确定基线，再说明收益。");
  await page.getByRole("button", { name: /对照资料/ }).click();
  await page.locator(".compare-panel").waitFor();
  await page.locator(".compare-panel").getByRole("button", { name: "查看原始面经 →", exact: true }).first().click();
  await page.getByRole("button", { name: "返回上一个对象", exact: true }).click();
  await page.getByRole("button", { name: "关闭对照资料", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "回答第 1 点", exact: true }).inputValue(), "我的草稿：先确定基线，再说明收益。");
  await nav("首页");
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  await fault();
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await page.locator(".knowledge-editor").getByText("验收：写入失败 草稿仍在，可继续修改或重试。", { exact: true }).waitFor();
  assert.equal((await load()).syncBlocks.find(b => b.id === "performance").body, reviewed.syncBlocks.find(b => b.id === "performance").body);
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await page.getByText("已保存", { exact: true }).waitFor();
  const saved = await load();
  assert.deepEqual(saved.questions, reviewed.questions);
  assert.deepEqual(saved.resumeExperiences, reviewed.resumeExperiences);
  await page.getByRole("button", { name: /对照资料/ }).click();
  await shot("知识库-桌面");
  await page.getByRole("button", { name: "关闭对照资料", exact: true }).click();
  await page.getByRole("button", { name: "管理关联", exact: true }).click();
  const selector = page.getByRole("dialog").getByRole("combobox").first();
  await fault();
  await selector.selectOption("");
  await page.getByRole("dialog").getByText(/验收：写入失败/).waitFor();
  assert.equal((await load()).questions.find(q => q.id === saved.aiReviews[0].candidates[0].createdQuestionId).linkedSyncBlockId, "performance");
  await selector.selectOption("");
  await page.waitForFunction(async () => (await (await import("/src/data/repository.ts")).indexedDbRepository.load()).questions.filter(q => q.linkedSyncBlockId === "performance").length === 0);
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  checks.push("来源逐层对照、草稿保留、离开保护、正文与关系失败重试各自保存");
  await page.getByRole("textbox", { name: "搜索全部内容", exact: true }).fill("性能");
  await page.getByRole("textbox", { name: "搜索全部内容", exact: true }).press("Enter");
  await page.locator(".global-search-scopes").getByRole("button", { name: /^问答/ }).click();
  await page.locator(".global-search-result").first().click();
  await page.getByRole("button", { name: "返回上次位置", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "全局搜索知识库", exact: true }).inputValue(), "性能");
  assert.equal(await page.locator(".global-search-scopes button.active").innerText().then(t => t.startsWith("问答")), true);
  checks.push("全局搜索返回保留查询与分类");
  await nav("练习"); await tab("模拟面试");
  await page.getByPlaceholder("例如：字节跳动").fill("模拟验收");
  await page.getByPlaceholder("例如：AI 产品经理").fill("前端工程师");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "返回上次操作", exact: true }).click();
  assert.equal(await page.getByPlaceholder("例如：字节跳动").inputValue(), "模拟验收");
  await page.evaluate(async () => {
    await (await import("/src/data/repository.ts")).indexedDbRepository.setPreference("ai.provider.config", { protocol: "openai-compatible", endpoint: "https://qa.invalid/v1", model: "qa-model" });
    sessionStorage.setItem("interview-atlas.ai.provider-keys", JSON.stringify({ custom: "isolated-test-key" }));
  });
  await page.reload();
  let turnFail = false, reportFail = true;
  await page.route("https://qa.invalid/**", async route => {
    const request = route.request().postDataJSON();
    const report = request.messages[0].content.includes("strengths");
    if (report && reportFail || !report && turnFail) {
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { message: "验收模型请求失败" } }) });
    }
    const w = await load(), s = w.mockInterviews[0];
    let value;
    if (report) {
      const candidate = s.messages.find(m => m.role === "candidate");
      const question = s.messages.find(m => m.role === "interviewer");
      const evidenceRefs = [{ messageId: candidate.id, quote: candidate.content }];
      value = { summary: "有明确的基线与验证方法", overallAssessment: "回答给出了本人的做法，可补充量化收益。",
        strengths: [{ title: "方法清晰", detail: "回答包含对照组与一致条件。", evidenceRefs }], improvements: [],
        nextSteps: ["补充 LCP 改善幅度与测量周期。"],
        questionReviews: [{ questionMessageId: question.id, question: question.content, assessment: "讲清了验证方法，尚可补充数字。", suggestion: "补充优化前后数据与自己的贡献。", evidenceRefs }],
        questions: [{ questionMessageId: question.id, title: question.content, tags: ["性能"], evidenceRefs }] };
    } else {
      value = { action: s.messages.length ? "followup" : "ask", competencyId: s.harness.plan[0].id,
        message: s.messages.length ? "你如何确保指标变化来自这次优化？" : "请介绍一次你参与的性能优化，以及如何验证效果。", shouldEnd: false, endReason: "" };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(value) } }] }) });
  });
  await page.getByRole("button", { name: "开始模拟面试", exact: true }).click();
  await page.getByRole("textbox", { name: "输入面试回答", exact: true }).waitFor();
  await page.getByRole("textbox", { name: "输入面试回答", exact: true }).isEnabled();
  await page.waitForFunction(() => !document.querySelector('[aria-label="输入面试回答"]')?.disabled);
  turnFail = true;
  const answer = "我保留对照组，在相同设备和网络条件下比较 LCP，并连续观察一周。";
  await page.getByRole("textbox", { name: "输入面试回答", exact: true }).fill(answer);
  await page.getByRole("button", { name: "发送回答", exact: true }).click();
  await page.getByRole("button", { name: "重试本轮", exact: true }).waitFor();
  assert.equal((await load()).mockInterviews[0].messages.filter(m => m.role === "candidate").length, 1);
  await page.reload();
  await page.getByRole("button", { name: "重试本轮", exact: true }).waitFor();
  turnFail = false;
  await page.getByRole("button", { name: "重试本轮", exact: true }).click();
  await page.getByText("你如何确保指标变化来自这次优化？", { exact: true }).waitFor();
  assert.equal((await load()).mockInterviews[0].messages.filter(m => m.role === "candidate").length, 1);
  await page.getByRole("button", { name: "结束面试", exact: true }).click();
  await page.getByRole("button", { name: "重试报告", exact: true }).waitFor();
  assert.equal(await page.locator(".report-transcript-scroll").getByText(answer, { exact: true }).count(), 1);
  await page.reload();
  await page.getByRole("button", { name: "重试报告", exact: true }).waitFor();
  reportFail = false;
  await page.getByRole("button", { name: "重试报告", exact: true }).click();
  await page.locator(".question-feedback .evidence-quote").click();
  await page.locator(".report-transcript-scroll mark").waitFor();
  assert.equal(await page.locator(".report-transcript-scroll mark").innerText(), answer);
  await shot("复盘-桌面");
  await page.getByRole("button", { name: "打开本场问答", exact: true }).click();
  await page.getByRole("button", { name: "返回上次位置", exact: true }).click();
  await page.locator(".review-workspace").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".report-mobile-tabs").getByRole("button", { name: "逐题反馈", exact: true }).click();
  await page.locator(".question-feedback .evidence-quote").click();
  assert.equal(await page.locator(".report-transcript-panel").isVisible(), true);
  assert.equal(await page.locator(".report-feedback-panel").isVisible(), false);
  await page.getByRole("button", { name: "返回同一条反馈 →", exact: true }).click();
  assert.equal(await page.locator(".report-feedback-panel").isVisible(), true);
  await shot("复盘-手机");
  checks.push("模拟请求失败前回答已落库，刷新重试不重复；报告失败可读原文并独立重试；引用定位与知识返回；手机反馈/原文切换");
  await nav("首页"); await shot("首页-手机");
  await nav("整理"); await shot("整理-手机");
  await page.getByRole("button", { name: "查看依据", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "查看依据", exact: true }).evaluate(el => el === document.activeElement), true);
  await nav("知识库");
  await page.getByRole("navigation", { name: "知识库分类" }).getByRole("button", { name: "聚合块", exact: true }).click();
  await page.locator(".knowledge-object-list").getByRole("button").filter({ hasText: "性能优化" }).click();
  await page.getByRole("button", { name: /对照资料/ }).click(); await shot("知识库-手机");
  await page.getByRole("button", { name: "关闭对照资料", exact: true }).click();
  await nav("练习"); await tab("闪卡复习"); await shot("闪卡-手机");
  for (const width of [320, 390, 650, 900, 1150, 1568]) {
    await page.setViewportSize({ width, height: width > 1000 ? 1002 : 700 });
    for (const name of ["首页", "整理", "知识库", "练习"]) {
      await nav(name);
      const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.ok(geometry.scrollWidth <= geometry.width + 1, `${name} at ${width}: ${JSON.stringify(geometry)}`);
    }
  }
  assert.deepEqual(errors, []);
  checks.push("320/390/650/900/1150/1568px 四入口无页面横向溢出，手机依据关闭恢复焦点");
  await writeFile(`${output}/验收结果.json`, JSON.stringify({ passed: true, checks, pageErrors: errors }, null, 2));
  console.log("PASS", checks);
} finally { await browser.close(); }
