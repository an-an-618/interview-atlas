import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const output = process.env.MOCK_CHECK_DIR ?? "/tmp/atlas-mock-harness";
await mkdir(output, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff": "font/woff", ".woff2": "font/woff2" };
let mode = "success";
let referenceMode = "native";
let heldRequest;
let releaseHeld;
const requests = [];
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/v1/chat/completions") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push(body);
      if (mode === "hold") {
        heldRequest?.();
        await new Promise((release) => { releaseHeld = release; });
      }
      if (mode === "turn-failure") {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: { message: "synthetic service failure" } }));
        return;
      }
      const system = body.messages[0].content;
      if (referenceMode === "fallback" && body.tools && !system.includes("独立的面试评估员")) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: { message: "unsupported parameter: tools" } }));
        return;
      }
      const toolMessages = body.messages.filter((m) => m.role === "tool");
      if (referenceMode === "native" && body.tools && !system.includes("独立的面试评估员") && toolMessages.length < 3) {
        const args = toolMessages.length === 0 ? { query: "智能体", kind: "resume", reason: "定位项目的验证方法" }
          : { materialId: JSON.parse(toolMessages[0].content).materialIds[0], reason: "核验项目细节" };
        const name = toolMessages.length === 0 ? "search_knowledge" : toolMessages.length === 1 ? "read_material" : "get_related_materials";
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [
          { id: `call_${requests.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } },
        ] } }] }));
        return;
      }
      let value;
      if (system.includes("独立的面试评估员")) {
        const { interview } = JSON.parse(body.messages[1].content);
        const question = interview.messages.find((m) => m.role === "interviewer" && m.kind === "ask");
        const answer = interview.messages.find((m) => m.role === "candidate");
        const refs = [{ messageId: answer.id, quote: answer.content.slice(0, 12) }];
        value = mode === "report-failure" ? {} : {
          summary: "回答有明确的个人贡献", overallAssessment: "只依据本场保存的回答。",
          strengths: [{ title: "明确贡献", detail: "描述了评测与失败恢复。", evidenceRefs: refs }],
          improvements: [{ title: "不可核验项", detail: "将被排除", evidenceRefs: [{ messageId: "fake", quote: "收入翻倍" }] }],
          nextSteps: ["下次补充评测的对照样本。"],
          questionReviews: [{ questionMessageId: question.id, question: question.content, assessment: "贡献可观察", suggestion: "补充决策依据", evidenceRefs: refs }],
          questions: [{ questionMessageId: question.id, title: "项目贡献", tags: ["项目"], evidenceRefs: refs }],
        };
      } else {
        const progress = JSON.parse(system.split("【应用维护的面试计划与进度】\n")[1].split("\n")[0]);
        const followup = progress.mainAsked === 1 && progress.mainAnswered === 1 && progress.currentFollowups === 0;
        value = {
          message: followup ? "你的评测方案如何验证失败恢复？" : `请描述第 ${progress.mainAsked + 1} 个主题的决策依据？`,
          action: followup ? "followup" : "ask", competencyId: followup ? progress.currentCompetencyId : progress.suggestedNextCompetency,
          shouldEnd: false, endReason: "",
        };
        const latestId = JSON.parse(system.split("【本场消息索引】\n")[1].split("\n")[0]).latestCandidateMessageId;
        const candidateText = body.messages.filter((m) => m.role === "user" && !m.content.startsWith("工具预算")).at(-1)?.content;
        if (referenceMode === "native" && latestId) value.observation = {
          competencyId: progress.currentCompetencyId, evidenceSufficient: false,
          gaps: ["需要补充个人贡献与结果归因"], nextFocus: "澄清验证方法",
          evidenceRefs: [{ messageId: latestId, quote: candidateText.slice(0, 12) }],
        };
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }));
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const path = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
    if (path !== root && !path.startsWith(root + sep)) throw new Error("invalid path");
    response.writeHead(200, { "Content-Type": mime[extname(path)] ?? "application/octet-stream" });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  headless: true, args: ["--use-mock-keychain", "--password-store=basic"],
});
const results = [];
try {
  for (const scenario of [{ width: 1440, reference: "native" }, { width: 390, reference: "native" },
    { width: 1440, reference: "fallback" }, { width: 390, reference: "fallback" }]) {
    const { width } = scenario;
    referenceMode = scenario.reference;
    mode = "success";
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", hasTouch: width < 500 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const readWorkspace = () => page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const open = indexedDB.open("interview-atlas");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const values = await Promise.all(["mockInterviews", "interviews", "questions"].map((name) => new Promise((resolve, reject) => {
        const request = database.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })));
      database.close();
      return { sessions: values[0], interviews: values[1], questions: values[2] };
    });
    const navigate = async (name) => {
      if (width < 500) await page.getByTitle("打开导航", { exact: true }).click();
      await page.locator(".sidebar").getByRole("button", { name, exact: true }).click();
    };
    const waitFor = async (predicate, message) => {
      for (let i = 0; i < 100; i++) {
        const value = await readWorkspace();
        if (predicate(value)) return value;
        await page.waitForTimeout(50);
      }
      throw new Error(message);
    };
    await page.goto(base);
    await page.locator(".sidebar").waitFor({ state: "attached" });
    // Seed only this disposable browser context with synthetic credentials and configuration.
    await page.evaluate(async (endpoint) => {
      sessionStorage.setItem("interview-atlas.ai.provider-keys", JSON.stringify({ custom: "synthetic-test-only" }));
      localStorage.setItem("interview-atlas-home-flashcards", "false");
      const database = await new Promise((resolve) => {
        const request = indexedDB.open("interview-atlas");
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("preferences", "readwrite");
        transaction.objectStore("preferences").put({ key: "ai.provider.config", value: { protocol: "openai-compatible", endpoint, model: "test-model" } });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(["resumeExperiences", "questions", "syncBlocks"], "readwrite");
        const timestamps = { createdAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" };
        transaction.objectStore("resumeExperiences").put({ ...timestamps, id: "replay-resume", type: "项目", title: "智能体评测项目",
          organization: "示例星河", period: "", bullets: ["我负责智能体评测方案和失败恢复验证。"],
          linkedQuestionIds: ["replay-question"], linkedSyncBlockIds: [] });
        transaction.objectStore("questions").put({ ...timestamps, id: "replay-question", title: "评测验证方法", answer: "用基线和失败样本验证。",
          notes: "", tags: ["评测"], sourceInterviewIds: [], linkedSyncBlockId: "replay-block" });
        transaction.objectStore("syncBlocks").put({ ...timestamps, id: "replay-block", title: "验证归因", body: "使用对照样本。",
          reviewNotes: "", linkedQuestionIds: ["replay-question"], hidden: false, favorite: false, pinned: false });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }, `${base}/v1`);
    await page.reload();
    await navigate("模拟面试");
    await page.getByRole("button", { name: "进入面试间", exact: true }).click();
    await page.getByPlaceholder("例如：字节跳动").fill("示例星河");
    await page.getByPlaceholder("例如：AI 产品经理").fill("Agent 产品经理");
    await page.getByPlaceholder("粘贴岗位职责和要求，面试官会据此调整考察重点。").fill("负责智能体工具调用策略与评测指标");
    await page.locator(".mock-setup select").selectOption("6");
    await page.getByRole("button", { name: "开始模拟面试", exact: true }).click();
    await page.locator(".mock-message.interviewer").waitFor();
    await page.getByLabel("输入面试回答", { exact: true }).waitFor({ state: "visible" });
    assert.match(await page.locator(".mock-chat-meta").innerText(), /0\/6 主问题/);
    const chipHeights = await page.locator(".mock-plan-progress span").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    assert.ok(chipHeights.every((height) => height < 40), "progress chips must stay compact");
    assert.match(await page.locator(".mock-reference-mode").innerText(), referenceMode === "native" ? /按需取材/ : /应用预选材料/);
    await page.screenshot({ path: `${output}/chat-${referenceMode}-${width}.png`, fullPage: true });
    mode = "turn-failure";
    const send = async (answer) => {
      await page.getByLabel("输入面试回答", { exact: true }).fill(answer);
      await page.getByRole("button", { name: "发送回答", exact: true }).click();
    };
    await send("我负责设计评测方案和工具调用的失败恢复。");
    await page.getByRole("button", { name: "重试本轮", exact: true }).waitFor();
    let saved = await readWorkspace();
    assert.equal(saved.sessions[0].messages.filter((m) => m.role === "candidate").length, 1);
    assert.ok(saved.sessions[0].harness.traces.some((t) => t.outcome === "failed"), "failed request trace must survive runtime checkpoints");
    assert.equal(await page.getByLabel("输入面试回答", { exact: true }).inputValue(), "");
    mode = "success";
    await page.getByRole("button", { name: "重试本轮", exact: true }).click();
    await waitFor((w) => w.sessions[0]?.messages.at(-1)?.kind === "followup", "followup missing");
    assert.match(await page.locator(".mock-plan-progress").innerText(), /追问 1 次/);
    assert.match(await page.locator(".mock-chat-meta").innerText(), /1\/6 主问题/);
    mode = "hold";
    const observed = new Promise((resolve) => { heldRequest = resolve; });
    await send("我先建立基线，再回放工具调用失败样本。");
    await observed;
    await page.reload();
    mode = "success";
    releaseHeld?.();
    await navigate("模拟面试");
    await page.getByRole("button", { name: "查看历史模拟", exact: true }).click();
    await page.locator(".mock-history-list button").first().click();
    await page.getByRole("button", { name: "重试本轮", exact: true }).waitFor();
    await page.getByRole("button", { name: "重试本轮", exact: true }).click();
    saved = await waitFor((w) => w.sessions[0]?.messages.at(-1)?.kind === "ask" && w.sessions[0].messages.length >= 5, "resume failed");
    assert.equal(saved.sessions[0].messages.filter((m) => m.role === "candidate").length, 2);
    for (let main = 2; main <= 6; main++) {
      if (main === 6) mode = "report-failure";
      await send(`第 ${main} 个主题中，我负责分析数据、选择方案并验证结果。`);
      if (main < 6) await waitFor((w) => w.sessions[0]?.messages.at(-1)?.role === "interviewer" && w.sessions[0].messages.filter((m) => m.kind === "ask").length === main + 1, "next main question missing");
    }
    await page.getByRole("button", { name: "重新生成", exact: true }).waitFor();
    saved = await readWorkspace();
    assert.equal(saved.interviews.length, 1);
    assert.equal(saved.sessions[0].harness.reportStatus, "failed");
    mode = "success";
    await page.getByRole("button", { name: "重新生成", exact: true }).click();
    await page.locator(".mock-report-summary").waitFor();
    saved = await waitFor((w) => w.sessions[0]?.harness.reportStatus === "completed", "report checkpoint missing");
    assert.equal(saved.sessions[0].messages.filter((m) => m.role === "candidate").length, 7);
    assert.equal(saved.questions.length, 2);
    const ingested = saved.questions.find((q) => saved.sessions[0].questionIds.includes(q.id));
    assert.equal(ingested.answer, saved.sessions[0].messages.find((m) => m.role === "candidate").content);
    assert.equal(ingested.evidenceRefs[0].start, 0);
    assert.equal(saved.sessions[0].feedback.validationWarnings.length, 1);
    assert.equal(saved.sessions[0].harness.mode, referenceMode);
    const turnTraces = saved.sessions[0].harness.traces.filter((t) => t.operation === "turn" && t.outcome === "completed");
    assert.ok(turnTraces.every((t) => t.attempts <= 5 && (t.tools?.length ?? 0) <= 3));
    if (referenceMode === "native") {
      assert.deepEqual(turnTraces[0].tools.map((t) => t.name), ["search_knowledge", "read_material", "get_related_materials"]);
      assert.ok(saved.sessions[0].harness.observations.length > 0);
    } else {
      assert.ok(turnTraces.every((t) => !t.tools.length));
      assert.match(saved.sessions[0].harness.fallbackReason, /明确拒绝/);
    }
    await page.getByText("查看本场取材记录", { exact: true }).click();
    await page.locator(".mock-reference-log[open]").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `overflow at ${width}`);
    await page.screenshot({ path: `${output}/report-${referenceMode}-${width}.png`, fullPage: true });
    await navigate("设置");
    await page.getByRole("button", { name: "数据管理", exact: false }).click();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载备份", exact: true }).click();
    const download = await downloaded;
    const payload = await readFile(await download.path());
    const backup = JSON.parse(payload.toString());
    assert.equal(backup.formatVersion, 11);
    assert.deepEqual(backup.mockInterviews[0].harness, JSON.parse(JSON.stringify(saved.sessions[0].harness)));
    await page.locator(".migration-file-input").setInputFiles({ name: "synthetic-backup.json", mimeType: "application/json", buffer: payload });
    await page.getByRole("button", { name: "导入并替换", exact: true }).click();
    await page.getByRole("heading", { name: "确认导入备份", exact: true }).waitFor({ state: "hidden" });
    assert.deepEqual(JSON.parse(JSON.stringify((await readWorkspace()).sessions)), JSON.parse(JSON.stringify(saved.sessions)));
    assert.deepEqual(errors, []);
    results.push({ width, mode: referenceMode, mainQuestions: 6, followups: 1, answers: 7, recovery: "passed", reportRetry: "passed",
      backup: "passed", toolCalls: turnTraces.reduce((n, t) => n + t.tools.length, 0),
      modelRequests: turnTraces.reduce((n, t) => n + t.attempts, 0), runtimeErrors: errors });
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ passed: true, results, requests: requests.length }, null, 2));
  console.log(JSON.stringify({ passed: true, results, requests: requests.length, output }, null, 2));
} finally {
  releaseHeld?.();
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
