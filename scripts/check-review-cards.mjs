import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:43118";
const screenshotDir = process.env.SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true, args: ["--use-mock-keychain", "--password-store=basic"],
});
const errors = [];
const newPage = async (options = {}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", ...options });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === new URL(appUrl).origin || ["data:", "blob:"].includes(url.protocol) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(appUrl);
  await page.locator(".overview-page").waitFor();
  return page;
};
const seed = async (page, mode = "aggregate") => {
  await page.evaluate(async (mode) => {
    const { createDemoWorkspace } = await import("/src/data/demo.ts");
    const { addStandaloneQuestion, addSyncBlock, emptyWorkspace } = await import("/src/domain/workspace.ts");
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    let workspace = mode === "empty" || mode === "titles" || mode === "single" || mode === "pair" ? emptyWorkspace() : createDemoWorkspace();
    if (mode === "aggregate") {
      workspace.syncBlocks[0].favorite = false;
      workspace.syncBlocks[0].body = Array.from({ length: 18 }, (_, i) => `第 ${i + 1} 点：用具体证据说明目标、行动和结果，把当时的判断与后续的验证分开。`).join("\n");
      for (let i = 1; i < 6; i++) {
        const question = addStandaloneQuestion(workspace, { title: `练习 ${i}：如何整理一个可以反复复习的问题？`, answer: "先明确问题，再记录证据，最后总结可复用的回答。", tags: [] });
        workspace = addSyncBlock(question.workspace, {
          title: `聚合卡片 ${i}：如何在目标、约束和真实反馈之间，找到更好的判断依据？`,
          body: workspace.syncBlocks[0].body, reviewNotes: "", questionIds: [question.question.id], resumeExperienceIds: [],
        }).workspace;
      }
      workspace.syncBlocks.push({ ...workspace.syncBlocks[0], id: "hidden-review-block", title: "隐藏卡片不应被抽到", hidden: true, linkedQuestionIds: [] });
    } else if (mode === "atomic") {
      workspace.syncBlocks = [];
      workspace.questions.forEach((question) => { question.linkedSyncBlockId = null; });
      workspace.resumeExperiences.forEach((experience) => { experience.linkedSyncBlockIds = []; });
    } else if (["titles", "single", "pair"].includes(mode)) {
      const titles = mode === "titles" ? [
        "怎样让复习更有效？",
        "你觉得500条样本能够很好的去解决你们想要的这么多维度的问题吗？",
        "在样本数量有限、反馈来源不同、目标又需要兼顾多个维度的情况下，你会如何判断当前的结论是否可靠，并设计下一轮验证来减少决策中的不确定性？",
        "如何把一个复杂的问题整理成可以复用的判断？" + "请同时说明目标、约束、证据来源、验证过程和实际结果之间的关系。".repeat(18),
      ] : ["怎样让复习更有效？", "如何让知识连起来？"].slice(0, mode === "single" ? 1 : 2);
      for (const title of titles) {
        const question = addStandaloneQuestion(workspace, { title, answer: "先明确目标，再通过证据检验判断。", tags: [] });
        workspace = addSyncBlock(question.workspace, {
          title, body: question.question.answer, reviewNotes: "",
          questionIds: [question.question.id], resumeExperienceIds: [],
        }).workspace;
      }
    }
    await indexedDbRepository.save(workspace);
  }, mode);
  await page.reload();
  await page.locator(".overview-page").waitFor();
  await page.evaluate(() => document.fonts.ready);
};
const current = (page) => page.locator(".review-card-active").getAttribute("data-card-id");
const title = (page) => page.locator("#review-card-title").innerText();
const settled = (page) => page.waitForFunction(() =>
  !document.querySelector(".review-card-stack.is-turning") &&
  document.querySelector(".review-card-stack")?.getAnimations({ subtree: true })
    .every((animation) => animation.playState === "finished"),
);
const navigate = async (page, direction) => {
  const before = await current(page);
  await page.getByRole("button", { name: direction === "next" ? "下一张卡片" : "上一张卡片", exact: true }).click();
  await settled(page);
  assert.notEqual(await current(page), before);
};
const shot = async (page, name) => {
  if (screenshotDir) {
    if (name !== "carousel-mid-motion") await page.waitForFunction(() =>
      document.querySelector(".page")?.getAnimations({ subtree: true }).every((animation) => animation.playState === "finished"),
    );
    await page.screenshot({ path: `${screenshotDir}/${name}.png` });
  }
};
const flip = async (page, back = true) => {
  await page.getByRole("button", { name: back ? "翻转卡片查看答案" : "翻转卡片回到问题", exact: true }).click();
  assert.equal(await page.locator(".review-card-active .review-flipper").evaluate((el) => el.classList.contains("is-flipped")), back);
  assert.equal(await page.locator(".review-card-active .review-card-front").getAttribute("aria-hidden"), back ? "true" : null);
  assert.equal(await page.locator(".review-card-active .review-card-back").getAttribute("aria-hidden"), back ? null : "true");
  assert.equal(await page.getByRole("button", { name: "收起回答", exact: true }).count(), 0);
  await page.waitForFunction(() => {
    const el = document.querySelector(".review-card-active .review-flipper");
    return el.getAnimations().every((animation) => animation.playState === "finished");
  });
};
const geometry = async (page, label) => {
  await page.waitForFunction(() => document.querySelector(".overview-page").getAnimations().every((animation) => animation.playState === "finished"));
  await page.locator(".review-card-active").waitFor();
  await page.locator(".review-stage").scrollIntoViewIfNeeded();
  const shape = await page.evaluate(() => {
    const hero = document.querySelector(".review-hero").getBoundingClientRect();
    const card = document.querySelector(".review-card-active").getBoundingClientRect();
    const previous = document.querySelector('.review-card[data-position="-1"]')?.getBoundingClientRect();
    const question = document.querySelector(".review-card-active .review-question-link");
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      heroBottom: hero.bottom, cardWidth: card.width, cardHeight: card.height, cardBottom: card.bottom,
      contentTop: document.querySelector(".overview-content").getBoundingClientRect().top, viewport: innerHeight,
      heroHeight: hero.height, stage: document.querySelector(".review-stage").getBoundingClientRect().toJSON(),
      previousHeight: previous?.height,
      headingLine: parseFloat(getComputedStyle(question).lineHeight), questionSpace: question.clientHeight,
      previewInert: [...document.querySelectorAll(".review-card-preview")].every((el) => el.inert && el.getAttribute("aria-hidden") === "true"),
    };
  });
  assert.equal(shape.overflow, false, `${label}: no horizontal overflow`);
  assert.ok(shape.contentTop >= shape.heroBottom - 1, `${label}: recent content follows embedded flashcards`);
  assert.ok(shape.heroHeight < 640, `${label}: flashcards occupy a compact home section`);
  assert.ok(shape.cardWidth / shape.cardHeight < 0.8 && shape.cardHeight > 250, `${label}: portrait card ${JSON.stringify(shape)}`);
  assert.ok(shape.cardBottom <= shape.stage.bottom && shape.questionSpace >= shape.headingLine * 2, `${label}: card fits its stage and question has room ${JSON.stringify(shape)}`);
  assert.ok(shape.previousHeight < shape.cardHeight, `${label}: centre card is larger`);
  assert.equal(shape.previewInert, true);
  const before = await page.locator(".review-card-active").boundingBox();
  await shot(page, `${label}-front`);
  await flip(page);
  const after = await page.locator(".review-card-active").boundingBox();
  if (Math.abs(after.y - before.y) > 1) {
    console.log("Flip scroll state", await page.evaluate(() => ({
      scrollY, active: document.activeElement?.outerHTML.slice(0, 150),
      stageTop: document.querySelector(".review-stage").scrollTop,
      stageLeft: document.querySelector(".review-stage").scrollLeft,
    })));
    await shot(page, `${label}-flip-scroll`);
  }
  for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(after[key] - before[key]) < 1, `${label}: flip preserves ${key}`);
  await shot(page, `${label}-back`);
  await flip(page, false);
};
const nativeSwipe = async (page, dx, dy = 0, touch = false) => {
  await settled(page);
  const box = await page.locator(".review-card-active .review-card-question").boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height * 0.3;
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let n = 1; n <= 6; n++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * n / 6, y: y + dy * n / 6 }] });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
  }
  await settled(page);
};

const verifyCards = async () => {
  const page = await newPage();
  await seed(page);
  await geometry(page, "desktop");
  await flip(page);
  assert.equal(await page.getByRole("button", { name: "翻转卡片回到问题", exact: true }).evaluate((el) => el === document.activeElement), true, "flip retains usable focus");
  const answerBox = await page.locator(".review-card-active .review-answer-link").boundingBox();
  await page.mouse.move(answerBox.x + answerBox.width / 2, answerBox.y + answerBox.height / 2);
  await page.mouse.wheel(0, 180);
  await page.waitForFunction(() => document.querySelector(".review-card-active .review-answer-link").scrollTop > 0);
  assert.equal(await page.evaluate(() => scrollY), 0, "answer scroll stays inside card");
  await flip(page, false);
  const first = await current(page);
  const firstTitle = await title(page);
  await page.getByRole("button", { name: "收藏当前卡片", exact: true }).click();
  assert.equal(await current(page), first, "star does not navigate");
  await page.waitForFunction(async (id) => {
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    return (await indexedDbRepository.load()).syncBlocks.find((item) => item.id === id)?.favorite === true;
  }, first);
  await page.getByRole("button", { name: "取消收藏当前卡片", exact: true }).click();
  await navigate(page, "next");
  await navigate(page, "previous");
  assert.equal(await current(page), first, "previous returns to same card");
  const order = [];
  for (let i = 0; i < 6; i++) { order.push(await current(page)); await navigate(page, "next"); }
  assert.equal(new Set(order).size, 6, "each card occurs once per cycle");
  assert.equal(await current(page), first, "last wraps to first");
  assert.ok(!order.includes("hidden-review-block"));
  await nativeSwipe(page, -125);
  assert.equal(await current(page), order[1], "drag left advances");
  await nativeSwipe(page, 125);
  assert.equal(await current(page), first, "drag right goes back");
  await nativeSwipe(page, -18);
  assert.equal(await current(page), first, "short drag does not turn");
  await page.locator(".review-stage").focus();
  await page.keyboard.press("ArrowLeft"); await settled(page);
  assert.equal(await current(page), order[5], "left arrow previous");
  await page.keyboard.press("ArrowRight"); await settled(page);
  assert.equal(await current(page), first);
  await page.keyboard.press("Space");
  assert.equal(await page.locator(".review-card-active .review-flipper.is-flipped").count(), 1);
  await page.keyboard.press("ArrowRight"); await settled(page);
  assert.equal(await page.locator(".review-card-active .review-flipper.is-flipped").count(), 0, "new card starts with question");
  await navigate(page, "previous");
  const stageBox = await page.locator(".review-stage").boundingBox();
  await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
  await page.mouse.wheel(120, 2);
  await page.waitForFunction((id) => document.querySelector(".review-card-active")?.getAttribute("data-card-id") !== id, first);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(25, 0);
  assert.equal(await current(page), order[1], "momentum tail turns only once");
  assert.equal(await page.evaluate(() => scrollY), 0, "horizontal wheel does not shake page");
  // End the browser's current wheel sequence by doing a real, independent UI action.
  await flip(page); await flip(page, false);
  await page.waitForFunction((time) => performance.now() > time + 230, await page.evaluate(() => performance.now()));
  await page.mouse.wheel(-120, 0); await settled(page);
  await page.waitForFunction((id) => document.querySelector(".review-card-active")?.getAttribute("data-card-id") === id, first);
  assert.equal(await current(page), first, "negative trackpad wheel previous");
  const favorites = await page.evaluate(async () => {
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    return (await indexedDbRepository.load()).syncBlocks.filter((block) => block.favorite).length;
  });
  assert.equal(favorites, 0, "swipes never favorite cards");
  await page.locator(".review-source-picker").getByRole("button", { name: "原子问答", exact: true }).click();
  const atomic = await current(page);
  await page.getByRole("button", { name: "收藏当前卡片", exact: true }).click();
  await page.waitForFunction(async (id) => {
    const { indexedDbRepository } = await import("/src/data/repository.ts");
    return (await indexedDbRepository.load()).questions.find((item) => item.id === id)?.favorite === true;
  }, atomic);
  await page.locator(".review-source-picker").getByRole("button", { name: "聚合块", exact: true }).click();
  assert.equal(await current(page), first, "source switch retains cursor");
  await page.getByRole("button", { name: /查看关联的 \d+ 个原子问答/ }).click();
  await page.locator(".sync-detail").waitFor();
  assert.ok((await page.locator(".sync-detail").innerText()).includes(firstTitle), "linked entry opens current block");
  await page.getByRole("button", { name: "主页", exact: true }).click();
  assert.equal(await current(page), first, "returning retains session card");
  await page.locator(".home-favorites").scrollIntoViewIfNeeded();
  assert.ok(await page.getByRole("heading", { name: "我的收藏", exact: true }).isVisible());

  const motion = await newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: "no-preference" });
  await seed(motion);
  await geometry(motion, "short-desktop");
  const nextHandle = await motion.locator('.review-card[data-position="1"]').elementHandle();
  const incomingId = await nextHandle.getAttribute("data-card-id");
  await motion.getByRole("button", { name: "下一张卡片", exact: true }).click();
  await motion.waitForFunction(() => {
    const el = document.querySelector(".review-card-preview[data-position='0']");
    return el && el.getAnimations().some((animation) => animation.currentTime > 80 && animation.currentTime < 380);
  });
  await shot(motion, "carousel-mid-motion");
  await settled(motion);
  assert.equal(await current(motion), incomingId);
  assert.equal(await nextHandle.evaluate((el) => el.isConnected && el.classList.contains("review-card-active")), true, "incoming node promotes without remounting");
  await navigate(motion, "previous");
  await shot(motion, "carousel-return");

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
    const mobile = await newPage({ viewport, hasTouch: true, isMobile: true });
    await seed(mobile);
    await geometry(mobile, `mobile-${viewport.width}`);
    const start = await current(mobile);
    await nativeSwipe(mobile, -100, 0, true);
    assert.notEqual(await current(mobile), start, "touch left advances");
    await nativeSwipe(mobile, 100, 0, true);
    assert.equal(await current(mobile), start, "touch right returns");
    await nativeSwipe(mobile, 0, -90, true);
    assert.equal(await current(mobile), start, "vertical touch scroll does not turn");
  }
  const titles = await newPage();
  await seed(titles, "titles");
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    await titles.setViewportSize(viewport);
    await titles.waitForFunction(({ width, height }) =>
      innerWidth === width && innerHeight === height,
    viewport);
    await settled(titles);
    for (let i = 0; i < 4; i++) {
      const state = await titles.locator(".review-card-active .review-question-link").evaluate((el) => ({
        text: el.innerText, height: el.clientHeight, fullHeight: el.scrollHeight,
        line: parseFloat(getComputedStyle(el).lineHeight), overflow: getComputedStyle(el).overflowY,
      }));
      assert.ok(state.height >= state.line * 2, "long titles retain readable whole lines");
      if (state.text.length < 45 && viewport.width >= 390) {
        if (state.fullHeight > state.height + 1) await shot(titles, `title-fit-failure-${viewport.width}`);
        assert.ok(state.fullHeight <= state.height + 1, `normal multi-line questions fit without clipping: ${JSON.stringify({ viewport, ...state })}`);
      }
      if (state.text.length > 200) {
        assert.ok(state.fullHeight > state.height && state.overflow === "auto", "exceptional question scrolls in its own region");
        await shot(titles, `long-title-${viewport.width}`);
        await titles.waitForFunction(() =>
          document.querySelector(".page")?.getAnimations({ subtree: true })
            .every((animation) => animation.playState === "finished"),
        );
        await titles.locator(".review-card-active .review-question-link").scrollIntoViewIfNeeded();
        const box = await titles.locator(".review-card-active .review-question-link").boundingBox();
        const id = await current(titles);
        const pageScroll = await titles.evaluate(() => scrollY);
        await titles.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await titles.mouse.wheel(0, 180);
        await titles.waitForFunction(() => document.querySelector(".review-card-active .review-question-link").scrollTop > 0);
        assert.equal(await current(titles), id, "scrolling long question does not navigate");
        assert.equal(await titles.evaluate(() => scrollY), pageScroll, "long question scroll stays inside card");
      }
      await navigate(titles, "next");
    }
  }
  const small = await newPage();
  await seed(small, "single");
  assert.equal(await small.getByRole("button", { name: "下一张卡片", exact: true }).count(), 0);
  await flip(small); await flip(small, false);
  await seed(small, "pair");
  const pairFirst = await current(small);
  await navigate(small, "next"); await navigate(small, "next");
  assert.equal(await current(small), pairFirst, "two-card cycle");
  await seed(small, "atomic");
  await small.getByRole("button", { name: "用原子问答抽卡", exact: true }).click();
  await small.locator(".review-card-active").waitFor();
  await flip(small);
  await seed(small, "empty");
  assert.equal(await small.getByRole("button", { name: "创建聚合块", exact: true }).count(), 1);
  assert.equal(await small.locator(".review-card-preview").count(), 0);
};

const verifyShuffleAndEntry = async () => {
  for (const { viewport, reducedMotion } of [
    { viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" },
    { viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" },
    { viewport: { width: 320, height: 640 }, reducedMotion: "no-preference" },
    { viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" },
  ]) {
    const mobile = viewport.width < 681;
    const page = await newPage({ viewport, reducedMotion, hasTouch: mobile, isMobile: mobile });
    await seed(page);
    await geometry(page, `shuffle-layout-${viewport.width}-${reducedMotion}`);
    const flipStyle = await page.getByRole("button", { name: "翻转卡片查看答案", exact: true }).evaluate((el) => {
      const style = getComputedStyle(el);
      return { border: style.borderTopWidth, background: style.backgroundColor };
    });
    assert.deepEqual(flipStyle, { border: "0px", background: "rgba(0, 0, 0, 0)" }, "flip control is only text and icon");
    const header = await page.locator(".review-hero-header").evaluate((el) => {
      const controls = el.querySelector(".review-hero-controls").getBoundingClientRect();
      const bounds = el.getBoundingClientRect();
      return { fits: controls.left >= bounds.left && controls.right <= bounds.right + 1 };
    });
    assert.equal(header.fits, true, "source picker and shuffle fit even on narrow screens");
    const collectOrder = async () => {
      const order = [];
      for (let index = 0; index < 6; index++) { order.push(await current(page)); await navigate(page, "next"); }
      return order;
    };
    const before = await collectOrder();
    await flip(page);
    await page.evaluate(() => {
      const hero = document.querySelector(".review-hero");
      window.__atlasShuffleTiming = { start: performance.now() };
      window.__atlasShuffleMotion = [];
      const sampleMotion = () => {
        if (hero.getAttribute("aria-busy") !== "true") return;
        const card = document.querySelector(".review-card-active");
        const animation = card?.getAnimations()[0];
        if (animation) {
          const previous = window.__atlasShuffleMotion.at(-1);
          const elapsed = performance.now() - window.__atlasShuffleTiming.start;
          if (!previous || elapsed - previous.elapsed > 25) {
            const rect = card.getBoundingClientRect();
            window.__atlasShuffleMotion.push({
              elapsed, time: animation.currentTime, id: card.dataset.cardId,
              title: card.querySelector("h2").textContent,
              x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            });
          }
        }
        requestAnimationFrame(sampleMotion);
      };
      const observer = new MutationObserver(() => {
        if (hero.getAttribute("aria-busy") === "true") {
          window.__atlasShuffleTiming.start = performance.now();
          requestAnimationFrame(sampleMotion);
        }
        else {
          window.__atlasShuffleTiming.end = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(hero, { attributes: true, attributeFilter: ["aria-busy"] });
    });
    await page.getByRole("button", { name: "洗牌", exact: true }).click();
    if (reducedMotion !== "reduce") {
      await page.locator(".review-stage.is-shuffling-orbit").waitFor();
      assert.equal(await page.getByRole("button", { name: "洗牌", exact: true }).isEnabled(), false, "no repeat shuffle during animation");
      assert.equal(await page.getByRole("button", { name: "下一张卡片", exact: true }).isEnabled(), false, "turn locked during shuffle");
      assert.equal(await page.locator(".review-shuffle-orbits").count(), 0, "real cards animate without a substitute overlay");
      const orbit = page.locator(".review-card-active");
      await orbit.evaluate((el) => { window.__atlasShuffledNode = el; });
      const first = await orbit.boundingBox();
      const time = await orbit.evaluate((el) => el.getAnimations()[0].currentTime);
      await page.waitForFunction((time) => document.querySelector(".review-card-active")?.getAnimations()[0]?.currentTime > time + 120, time);
      const second = await orbit.boundingBox();
      assert.ok(Math.abs(first.x - second.x) + Math.abs(first.y - second.y) > 20, "cards move at a calmer pace along orbit");
      if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/shuffle-orbit-${viewport.width}.png` });
      await page.waitForFunction(() => document.querySelector(".review-card-active")?.getAnimations()[0]?.currentTime > 1800);
      if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/shuffle-braking-${viewport.width}.png` });
      await page.waitForFunction(() => document.querySelector(".review-card-active")?.getAnimations()[0]?.currentTime > 2230);
      if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/shuffle-stopped-${viewport.width}.png` });
    }
    await page.waitForFunction(() => document.querySelector(".review-hero")?.getAttribute("aria-busy") === "false");
    const elapsed = await page.evaluate(() => (window.__atlasShuffleTiming.end ?? performance.now()) - window.__atlasShuffleTiming.start);
    assert.ok(reducedMotion === "reduce" ? elapsed < 800 : elapsed >= 2400 && elapsed < 3500, `shuffle duration: ${elapsed}ms`);
    if (reducedMotion !== "reduce") {
      const motion = await page.evaluate(() => window.__atlasShuffleMotion);
      const speed = motion.slice(1).map((sample, index) => ({
        time: sample.time,
        value: Math.hypot(sample.x - motion[index].x, sample.y - motion[index].y) / (sample.time - motion[index].time),
      }));
      const early = speed.filter((sample) => sample.time > 400 && sample.time < 900);
      const late = speed.filter((sample) => sample.time > 1900 && sample.time < 2150);
      const mean = (values) => values.reduce((sum, sample) => sum + sample.value, 0) / values.length;
      assert.ok(early.length > 1 && late.length > 1 && mean(early) > mean(late) * 3, "measured card travel slows smoothly before stopping");
      const stopped = motion.filter((sample) => sample.time >= 2200);
      assert.ok(stopped.length >= 2, `cards visibly stop before the result appears: ${JSON.stringify(motion.slice(-6))}`);
      const result = await page.locator(".review-card-active").evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return {
          sameNode: el === window.__atlasShuffledNode,
          id: el.dataset.cardId, title: el.querySelector("h2").textContent,
          x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        };
      });
      assert.equal(result.sameNode, true, "the orbit card becomes the final current card without remounting");
      for (const sample of stopped) {
        assert.equal(sample.id, result.id, "stopped card identity matches the result");
        assert.equal(sample.title, result.title, "stopped card content matches the result");
        for (const key of ["x", "y", "width", "height"]) {
          assert.ok(Math.abs(sample[key] - result[key]) < 0.5, `no ${key} jump between stop and result: ${JSON.stringify({ sample, result })}`);
        }
      }
    }
    assert.equal(await page.locator(".review-shuffle-orbits").count(), 0);
    assert.equal(await page.locator(".review-card-active .review-flipper.is-flipped").count(), 0, "shuffled result begins on question face");
    assert.equal(await page.locator(".review-card-active .review-card-front .review-card-number").innerText(), "01 / 06");
    await shot(page, `shuffle-result-${viewport.width}-${reducedMotion}`);
    const after = await collectOrder();
    assert.equal(new Set(after).size, 6);
    assert.deepEqual([...after].sort(), [...before].sort(), "shuffle preserves membership");
    assert.notDeepEqual(after, before, "shuffle changes order");
    await navigate(page, "previous");
    assert.equal(await current(page), after[5], "previous wraps through new shuffled order");
    await navigate(page, "next");

    await page.locator(".overview-mock-room-entry").scrollIntoViewIfNeeded();
    await page.locator(".overview-mock-room-entry").click();
    await page.locator(".mock-setup-page").waitFor();
    await page.waitForFunction(() => scrollY === 0);
    assert.ok((await page.locator(".mock-setup-page").boundingBox()).y < 80, "interview-room setup opens at top");
    await shot(page, `mock-entry-top-${viewport.width}-${reducedMotion}`);
  }
};

const verifySettings = async () => {
  for (const mobile of [false, true]) {
    const prefs = await newPage(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {});
    await seed(prefs);
    const initialCard = await current(prefs);
    const openSettings = async () => {
      if (mobile) await prefs.getByTitle("打开导航", { exact: true }).click();
      await prefs.getByRole("button", { name: "设置", exact: true }).click();
    };
    const home = () => mobile
      ? prefs.locator(".bottom-overview").click()
      : prefs.locator(".sidebar").getByRole("button", { name: "主页", exact: true }).click();
    const assertSimpleHome = async () => {
      await prefs.locator(".overview-page.without-flashcards").waitFor();
      assert.equal(await prefs.locator(".review-hero").count(), 0, "disabled flashcards are removed");
      assert.equal(await prefs.locator(".home-recent").count(), 1, "recent knowledge remains");
      assert.equal(await prefs.locator(".home-favorites").count(), 1, "favorites remain");
      assert.equal(await prefs.locator(".overview-mock-room-entry").count(), 1, "interview-room entry remains");
      const layout = await prefs.evaluate(() => ({
        top: document.querySelector(".overview-content").getBoundingClientRect().top,
        mobile: innerWidth < 681,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      assert.ok(layout.top < 330, "recent content follows the introduction when cards are disabled");
      assert.equal(layout.overflow, false, "simple home has no horizontal overflow");
    };
    await openSettings();
    const toggle = prefs.getByRole("switch", { name: "首页闪卡", exact: true });
    assert.equal(await toggle.getAttribute("aria-checked"), "true", "flashcards enabled by default");
    await toggle.focus(); await prefs.keyboard.press("Space");
    assert.equal(await toggle.getAttribute("aria-checked"), "false", "keyboard toggles setting");
    await shot(prefs, `settings-flashcards-${mobile ? "mobile" : "desktop"}`);
    await home(); await assertSimpleHome();
    await shot(prefs, `home-without-flashcards-${mobile ? "mobile" : "desktop"}`);
    await prefs.locator(".overview-mock-room-entry").click();
    await prefs.locator(".mock-setup-page").waitFor();
    await home();
    await openSettings(); await toggle.click();
    await home();
    assert.equal(await current(prefs), initialCard, "enabling retains current session card");
    await openSettings(); await toggle.click();
    await prefs.reload();
    await assertSimpleHome();
    await openSettings();
    assert.equal(await toggle.getAttribute("aria-checked"), "false", "disabled preference survives reload");
    await home();
    await seed(prefs, "empty");
    await assertSimpleHome();
    await openSettings(); await toggle.click();
    await prefs.reload();
    await prefs.locator(".review-hero").waitFor();
    await openSettings();
    assert.equal(await toggle.getAttribute("aria-checked"), "true", "enabled preference survives reload");
  }
};

try {
  if (!process.argv.includes("--settings-only") && !process.argv.includes("--shuffle-only")) await verifyCards();
  if (!process.argv.includes("--settings-only")) await verifyShuffleAndEntry();
  if (!process.argv.includes("--shuffle-only")) await verifySettings();
  assert.deepEqual(errors, [], "no browser runtime errors");
  console.log(process.argv.includes("--shuffle-only")
    ? "Shuffle and entry verified: real cards orbit and slow to a stop, identical stopped/result node and content, continuous position and size, 2.5-second result, interaction lock, reduced motion and top-aligned interview entry on desktop/mobile."
    : process.argv.includes("--settings-only")
    ? "Home settings verified: default enabled, keyboard toggle, persistence, restored session, recent knowledge, favorites and interview-room entry on desktop/mobile including empty workspaces."
    : "Flashcards verified: compact geometry, flip, carousel, gestures, long-text layouts, persistent settings switch and interview-room entry on desktop/mobile.");
} finally {
  await browser.close();
}
