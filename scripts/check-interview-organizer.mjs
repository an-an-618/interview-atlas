import assert from "node:assert/strict";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
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
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(process.env.APP_URL ?? "http://127.0.0.1:43226");
  await page.waitForSelector("main");
  await page.evaluate(async () => {
    const domain = await import("/src/domain/workspace.ts");
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    let workspace = domain.emptyWorkspace();
    const records = [
      ["腾讯", "AI 产品经理", "一面", "2026-10-01", ["Agent", "评测"]],
      ["腾讯", "产品经理", "二面", "2026-09-18", ["商业化"]],
      ["字节跳动", "AI 产品经理", "一面", "2026-10-02", ["Agent"]],
    ];
    for (const [company, role, round, date, tags] of records) {
      const created = domain.addInterview(workspace, {
        company,
        role,
        round,
        date,
        source: "界面验证",
        rawText: `${company} ${role} ${round}`,
      });
      const questioned = domain.addQuestion(
        created.workspace,
        created.interview.id,
        {
          title: `${company}面试问题`,
          answer: "示例回答",
          tags,
        },
      );
      workspace = questioned.workspace;
    }
    await indexedDbRepository.save(workspace);
  });
  await page.reload();
  await page.locator(".overview-page").waitFor();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "面试记录", exact: false })
    .click();
  await page.locator(".interviews-page").waitFor();
  assert.equal(
    await page.locator(".interviews-page .page-header").getByText("新建").count(),
    0,
    "interview list header has no create action",
  );

  await page.getByRole("button", { name: /整理/ }).click();
  await page.getByRole("button", { name: "新建整理", exact: true }).click();
  await page.getByRole("button", { name: "保存整理", exact: true }).click();
  const companyPill = page
    .locator(".interview-collection-pill")
    .filter({ hasText: "腾讯" });
  await companyPill.waitFor();
  assert.match(await companyPill.innerText(), /腾讯\s*2/);
  assert.match(await companyPill.getAttribute("class"), /active/);
  assert.equal(await page.locator(".interview-row").count(), 2);

  await page.reload();
  await page.locator(".overview-page").waitFor();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "面试记录", exact: false })
    .click();
  await page.getByRole("button", { name: /整理/ }).click();
  await page.locator(".interview-organization").filter({ hasText: "按公司整理" }).waitFor();

  await page.getByRole("button", { name: "新建整理", exact: true }).click();
  await page
    .locator(".organizer-mode-grid")
    .getByRole("button", { name: "自定义", exact: true })
    .click();
  assert.equal(
    await page.locator(".organizer-mode-grid button.active").innerText(),
    "自定义",
  );
  await page.getByLabel("整理名称", { exact: true }).fill("求职优先级");
  await page.getByLabel("选项名称", { exact: true }).fill("重点跟进");
  await page
    .locator(".custom-interview-picker label")
    .filter({ hasText: "字节跳动" })
    .click();
  await page.getByRole("button", { name: "保存整理", exact: true }).click();
  await page
    .locator(".interview-organization")
    .filter({ hasText: "求职优先级" })
    .waitFor();
  const customPill = page
    .locator(".interview-collection-pill")
    .filter({ hasText: "重点跟进" });
  assert.match(await customPill.getAttribute("class"), /active/);
  assert.equal(await page.locator(".interview-row").count(), 1);
  assert.match(await page.locator(".interview-row").innerText(), /字节跳动/);

  await page.getByRole("button", { name: /筛选/ }).click();
  await page.getByLabel("审核状态").selectOption("pending");
  assert.equal(await page.locator(".segmented").count(), 0);
  await page.getByLabel("审核状态").selectOption("");
  assert.equal(await page.locator(".interview-filter-count").count(), 0);
  await page.getByLabel("审核状态").selectOption("pending");
  await page.getByRole("button", { name: "完成", exact: true }).click();

  if (process.env.SCREENSHOT_DIR) {
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/interview-organizer-desktop.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    "mobile has no horizontal overflow",
  );
  if (process.env.SCREENSHOT_DIR) {
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/interview-organizer-mobile.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "新建整理", exact: true }).click();
  await page
    .locator(".organizer-mode-grid")
    .getByRole("button", { name: "自定义", exact: true })
    .click();
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.querySelector(".interview-organizer-modal").scrollWidth <=
          innerWidth,
    ),
    true,
    "mobile organizer modal has no horizontal overflow",
  );
  if (process.env.SCREENSHOT_DIR) {
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/interview-organizer-modal-mobile.png`,
    });
  }
  await page
    .locator(".interview-organizer-modal")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: preset organization / custom collection / persistence / merged status filter / mobile layout",
  );
} finally {
  await context.close();
  await browser.close();
}
