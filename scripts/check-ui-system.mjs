import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const executablePath = process.env.CHROME_PATH ?? chromium.executablePath();
const args = ["--use-mock-keychain", "--password-store=basic"];
const url = process.env.APP_URL ?? "http://127.0.0.1:43118";
const output = process.env.SCREENSHOT_DIR;
if (output) await mkdir(output, { recursive: true });
const evidence = [], errors = [];
const nav = (page, name) => page.getByRole("navigation", { name: "一级导航" }).getByRole("button", { name, exact: true }).click();
async function seed(page) {
  page.setDefaultTimeout(8000);
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(url);
  await page.locator(".workspace-global-header").waitFor();
  await page.evaluate(async () => {
    const w = (await import("/src/data/demo.ts")).createDemoWorkspace(), now = new Date().toISOString();
    // Long real content makes scroll checks exercise lists and details.
    for (const q of w.questions) q.answer = `${q.answer}\n\n${"针对当前问题说明具体事实、推理与验证过程。\n".repeat(60)}`;
    w.questions.push(...Array.from({length:18}, (_,i) => ({
      ...w.questions[1], id:`ui-scroll-question-${i}`, title:`导航吸顶验证问题 ${i + 1}`,
    })));
    for(const block of w.syncBlocks) block.body += `\n\n${"用具体事实说明共性结论，保留推理过程、验证依据与适用边界。\n".repeat(60)}`;
    w.syncBlocks.push(...Array.from({length:18},(_,i)=>({
      ...w.syncBlocks[0],id:`ui-scroll-aggregate-${i}`,favorite:false,linkedQuestionIds:[],
      title:`聚合块目录验证 ${i+1}：如何讲清复杂项目的背景、个人行动与验证结果`,
    })));
    w.interviews[0].status = "pending";
    w.aiReviews = [{ id: "ui-review", interviewId: w.interviews[0].id, createdAt: now, updatedAt: now,
      candidates: [0, 1].map(i => ({ id: `ui-candidate-${i}`, title: `如何验证性能优化的效果？${i}`,
        answer: "建立基线，保留对照组，再比较优化前后的数据。", tags: ["性能"],
        sourceExcerpt: "", suggestedSyncBlockId: null, matchReason: "", questionDecision: "pending",
        syncDecision: "not_suggested", createdQuestionId: null })) }];
    await (await import("/src/data/repository.ts")).indexedDbRepository.save(w);
    sessionStorage.clear();
  });
  await page.reload();
  await page.locator(".workbench-home").waitFor();
}
async function check(page, name) {
  await page.mouse.move(0, 0);
  // Measure resting geometry after finite modal and color transitions finish.
  await page.evaluate(async () => {
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getTiming().iterations !== Infinity) await animation.finished.catch(() => {});
    }
  });
  await page.waitForFunction(() => [...document.querySelectorAll(".button.primary")]
    .filter(b => b.getClientRects().length && !b.closest("[inert]"))
    .every(b => getComputedStyle(b).backgroundColor === "rgb(37, 68, 56)"));
  const result = await page.evaluate(() => {
    const visible = e => e.getClientRects().length && !e.closest("[inert]") && e.getBoundingClientRect().height > 0;
    const controls = [...document.querySelectorAll(".button,.text-button,.icon-button,.back-button,.review-source-picker button,.workspace-tabs button,.review-flip-button,.review-detail-link,.review-related-link")]
      .filter(visible).map(b => {
        const r = b.getBoundingClientRect(), s = getComputedStyle(b);
        return { label: b.getAttribute("aria-label") || b.textContent.trim(), classes: b.className,
          height: +r.height.toFixed(1), radius: s.borderRadius, font: s.fontSize,
          left: r.left, right: r.right, disabled: b.disabled,
          icons: [...b.querySelectorAll("svg.lucide")].map(i => ({
            size: getComputedStyle(i).width, stroke: getComputedStyle(i).strokeWidth,
            semantic: i.dataset.uiIcon,
          })),
        };
      });
    const readingBoundaries = [...document.querySelectorAll(".sync-detail,.sync-list-item,.question-document,.question-relations > section,.interview-detail-nav")]
      .map(e => { const s=getComputedStyle(e); return {name:e.className,widths:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth]}; });
    const shuffle = document.querySelector(".review-shuffle-button");
    const shuffleStyle = shuffle ? { background:getComputedStyle(shuffle).backgroundColor, border:getComputedStyle(shuffle).borderColor,
      width:shuffle.getBoundingClientRect().width,height:shuffle.getBoundingClientRect().height } : null;
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      touch: matchMedia("(max-width:650px), (pointer:coarse)").matches, controls, readingBoundaries, shuffleStyle };
  });
  assert.ok(result.scrollWidth <= result.width + 1, `${name}: page overflow`);
  for(const edge of result.readingBoundaries) assert.deepEqual(edge.widths,["0px","0px","0px","0px"],`${name}: repeated reading boundary ${edge.name}`);
  if(result.shuffleStyle){
    assert.equal(result.shuffleStyle.background,"rgba(0, 0, 0, 0)",`${name}: shuffle stays quiet`);
    assert.equal(result.shuffleStyle.border,"rgba(0, 0, 0, 0)",`${name}: shuffle has no box`);
    assert.ok(Math.abs(result.shuffleStyle.width-132)<.01,`${name}: shuffle hit width`);
    assert.ok(Math.abs(result.shuffleStyle.height-44)<.01,`${name}: shuffle hit height`);
  }
  for (const c of result.controls) {
    assert.ok([32, 40, 44].includes(c.height), `${name}: ${c.label} height ${c.height}`);
    if (result.touch) assert.ok(c.height >= 44, `${name}: ${c.label} touch target`);
    assert.equal(c.radius, "8px", `${name}: ${c.label} radius`);
    if (c.classes.includes("icon-button")) assert.ok(c.label, `${name}: missing icon label`);
    assert.ok(c.left >= -1 && c.right <= result.width + 1, `${name}: ${c.label} outside viewport`);
    for (const icon of c.icons) {
      assert.equal(parseFloat(icon.stroke), 1.75, `${name}: ${c.label} stroke`);
      assert.equal(icon.size, c.classes.includes("icon-button") ? "18px" : "16px", `${name}: ${c.label} icon`);
    }
  }
  evidence.push({ name, ...result });
}
async function capture(page, slug) {
  if (output) await page.screenshot({ path: join(output, `${slug}.png`), fullPage: true, animations: "disabled" });
}
async function checkAggregateScroll(page, name) {
  const geometry=()=>page.evaluate(()=>{
    const rect=selector=>{
      const e=document.querySelector(selector);
      if(!e?.getClientRects().length) return null;
      const r=e.getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,position:getComputedStyle(e).position};
    };
    const list=document.querySelector(".sync-list");
    const detail=document.querySelector(".sync-detail");
    return {y:scrollY,width:innerWidth,height:innerHeight,zoom:devicePixelRatio,
      maxScroll:document.documentElement.scrollHeight-innerHeight,
      title:rect(".sync-page > .page-header"),search:rect(".sync-search-toolbar"),
      heading:rect(".sync-list-heading"),copy:rect(".sync-list-heading-copy"),
      toggle:rect(".sync-list-heading .sync-list-toggle"),first:rect(".sync-list-item"),
      header:rect(".workspace-global-header"),
      listScroll:list.scrollHeight-list.clientHeight,
      detailScroll:detail.scrollHeight-detail.clientHeight};
  });
  const initial=await geometry();
  assert.ok(initial.maxScroll>100,`${name}: long aggregate content scrolls the document`);
  assert.ok(initial.detailScroll<2,`${name}: aggregate answer is not locked in an inner scroller`);
  assert.ok(initial.listScroll<2,`${name}: directory has no clipped vertical list`);
  if(initial.heading) {
    assert.equal(initial.heading.position,"static",`${name}: directory heading must scroll normally`);
    assert.ok(initial.first.top>=initial.heading.bottom,`${name}: first item overlaps directory heading`);
    assert.ok(initial.copy.right<=initial.toggle.left+1,`${name}: collapse button overlaps directory title`);
  }
  await page.mouse.move(initial.width-8,initial.height-16);
  await page.mouse.wheel(0,Math.min(500,initial.maxScroll)*initial.zoom);
  await page.waitForFunction(()=>scrollY>20);
  const scrolled=await geometry();
  for(const key of ["title","search","heading","first"]) {
    if(initial[key]&&scrolled[key]) assert.ok(
      Math.abs(scrolled[key].top-initial[key].top+scrolled.y-initial.y)<1,
      `${name}: ${key} remained pinned while document scrolled`);
  }
  assert.equal(scrolled.header.top,0,`${name}: global navigation remains fixed`);
  evidence.push({name:`${name}/aggregate-natural-scroll`,scrollY:scrolled.y,headingGap:initial.heading?initial.first.top-initial.heading.bottom:null});
  await page.evaluate(()=>scrollTo({top:0,behavior:"instant"}));
  await page.waitForFunction(()=>scrollY===0);
}
async function checkGlobalHeader(page, name) {
  const header = page.locator(".workspace-global-header");
  const waitBottom=async()=>{
    try {
      await page.waitForFunction(()=>Math.abs(scrollY-(document.documentElement.scrollHeight-innerHeight))<1);
    } catch(error) {
      console.error(`${name}: initial scroll state`,initial);
      console.error(`${name}: boundary scroll state`,await page.evaluate(()=>({
        y:scrollY,maxScroll:document.documentElement.scrollHeight-innerHeight,zoom:devicePixelRatio,
        scrollHeight:document.documentElement.getBoundingClientRect().height,viewportHeight:visualViewport.height,
      })));
      throw error;
    }
  };
  const initial = await header.evaluate(e => ({
    top:e.getBoundingClientRect().top, height:e.getBoundingClientRect().height,
    position:getComputedStyle(e).position,
    measured:parseFloat(getComputedStyle(e.parentElement).getPropertyValue("--workspace-header-height")),
    reserved:parseFloat(getComputedStyle(e.parentElement).paddingTop),
    bounce:getComputedStyle(document.documentElement).overscrollBehaviorY,
    width:innerWidth,
    zoom:devicePixelRatio,
    maxScroll:document.documentElement.scrollHeight-innerHeight,
  }));
  assert.equal(initial.position,"fixed",`${name}: global header must be fixed to viewport`);
  assert.equal(initial.bounce,"none",`${name}: document boundary bounce disabled`);
  assert.ok(Math.abs(initial.height-initial.measured)<1,`${name}: actual header height tracked`);
  assert.ok(Math.abs(initial.height-initial.reserved)<1,`${name}: content reserves actual header height`);
  assert.ok(Math.abs(initial.top)<.1,`${name}: header at viewport top before scrolling`);
  if(initial.maxScroll<50) return;
  // Collect every animation frame during actual wheel input, including reversals
  // and attempts to scroll beyond both boundaries. Settled coordinates miss jitter.
  await page.evaluate(() => {
    const e=document.querySelector(".workspace-global-header");
    const main=document.querySelector(".workspace-shell > main");
    window.__headerFrames=[];
    window.__sampleHeader=true;
    const sample=()=>{
      const r=e.getBoundingClientRect();
      window.__headerFrames.push({top:r.top,left:r.left,height:r.height,
        mainTop:main.getBoundingClientRect().top,y:scrollY});
      if(window.__sampleHeader) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  // Chromium versions differ in wheel scaling at host zoom. The delta must
  // reach the boundary even below 100%, rather than undershoot by that factor.
  const wheelDistance=(initial.maxScroll+8)*Math.max(1,initial.zoom);
  // Keep wheel input in the outer reading margin, away from independently
  // scrollable question directories at narrow widths and browser zoom.
  await page.mouse.move(initial.width-8,initial.height+30);
  await page.mouse.wheel(0,wheelDistance);
  // Use consecutive wheel input: newly expanded panels can update compositor
  // scroll bounds after the first event. Keep sampling both frames and events.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.mouse.wheel(0,wheelDistance);
  await waitBottom();
  await page.mouse.wheel(0,400*initial.zoom);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.mouse.wheel(0,-wheelDistance);
  try {
    await page.waitForFunction(()=>scrollY===0);
  } catch(error) {
    console.error(`${name}: upward boundary`, await page.evaluate(() => ({
      y:scrollY,maxScroll:document.documentElement.scrollHeight-innerHeight,
      width:innerWidth,height:innerHeight,zoom:devicePixelRatio,
      hovered:[...document.querySelectorAll(":hover")].map(e=>e.className),
    })));
    if(output) {
      await capture(page,`failure-${name.replaceAll("/","-")}`);
      await writeFile(join(output,"ui-system-check.json"),JSON.stringify({pages:evidence,errors},null,2));
    }
    throw error;
  }
  await page.mouse.wheel(0,-400*initial.zoom);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.mouse.wheel(0,wheelDistance);
  await waitBottom();
  const frames=await page.evaluate(()=>{
    window.__sampleHeader=false;
    return window.__headerFrames;
  });
  assert.ok(frames.length>=6,`${name}: frames sampled during scrolling`);
  for(const frame of frames) {
    assert.ok(Math.abs(frame.top)<.1&&Math.abs(frame.left)<.1,`${name}: header moved during scroll`);
    assert.ok(Math.abs(frame.height-initial.height)<.1,`${name}: header height changed during scroll`);
    assert.ok(Math.abs(frame.mainTop+frame.y-frames[0].mainTop-frames[0].y)<1,`${name}: content jumped during scroll`);
  }
  const state = await header.evaluate(e => {
    const r=e.getBoundingClientRect();
    return {top:r.top,scrollY:window.scrollY,
      nav:[...e.querySelectorAll("nav button")].map(b=>{
        const t=b.getBoundingClientRect();
        const hit=document.elementFromPoint(t.left+t.width/2,t.top+t.height/2);
        return {label:b.textContent.trim(),visible:t.top>=r.top&&t.bottom<=r.bottom,
          clickable:hit===b||b.contains(hit)};
      }),
      sidebar:(()=>{const n=document.querySelector(".interview-detail-nav"); return n&&getComputedStyle(n).position==="sticky"
        ? {top:n.getBoundingClientRect().top,headerBottom:r.bottom} : null;})()};
  });
  assert.ok(Math.abs(state.top)<1,`${name}: global header remains at viewport top after scrolling ${state.scrollY}px`);
  for(const b of state.nav) {
    assert.ok(b.visible,`${name}: ${b.label} stays visible`);
    assert.ok(b.clickable,`${name}: ${b.label} is not covered`);
  }
  if(state.sidebar) assert.ok(state.sidebar.top>=state.sidebar.headerBottom,`${name}: directory below global header`);
  evidence.push({name:`${name}/global-header-scroll`,frames:frames.length,
    maxHeaderMovement:Math.max(...frames.map(f=>Math.abs(f.top))),...state});
  // Reset the document explicitly: a nested directory may consume upward wheel events.
  await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
  await page.waitForFunction(()=>window.scrollY===0);
}
async function pages(page, label, screenshots = false) {
  for (const [name, slug] of [["首页","home"],["面试记录","interviews"],["原子问答","questions"],["聚合块","aggregate"],["简历经历","resume"],["练习","mock"],["设置","settings"]]) {
    if (name === "设置") {
      await page.getByRole("button", { name: "设置", exact: true }).click();
      await page.getByRole("button", { name: /^数据管理/ }).click();
    } else {
      await nav(page, name);
      if(name==="练习") await page.getByRole("navigation",{name:"练习方式"}).getByRole("button",{name:"模拟面试",exact:true}).click();
    }
    await check(page, `${label}/${slug}`);
    await checkGlobalHeader(page, `${label}/${slug}`);
    if(name==="聚合块") await checkAggregateScroll(page,`${label}/${slug}`);
    if (screenshots) await capture(page, `${slug}-${label}`);
    assert.equal(await page.getByRole("button",{name:/^(对照资料|管理关联)$/}).count(),0);
    if (name === "面试记录") {
      await page.locator(".interview-open").first().click();
      await page.locator(".interview-detail-page").waitFor();
      await check(page,`${label}/interview-detail`);
      await checkGlobalHeader(page,`${label}/interview-detail`);
      if(screenshots) await capture(page,`interview-detail-${label}`);
    }
    if (name === "原子问答") {
      await page.locator(".question-list-row").first().click();
      await page.locator(".question-detail-page").waitFor();
      await check(page,`${label}/question-detail`);
      await checkGlobalHeader(page,`${label}/question-detail`);
      if(screenshots) await capture(page,`question-detail-${label}`);
    }
  }
}
if(!process.env.ATLAS_QA_ZOOM_ONLY) {
const browser = await chromium.launch({ executablePath, args });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await seed(page);
  for (const width of [1440, 390, 320, 650, 720, 900, 1040, 1041, 1150, 1904]) {
    await page.setViewportSize({ width, height: width <= 650 ? 844 : 1000 });
    await pages(page, String(width), [1440,390].includes(width));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await nav(page,"原子问答");
  await page.locator(".question-list-row").first().click();
  await page.locator(".question-detail-page").waitFor();
  await page.mouse.move(10,500);
  await page.mouse.wheel(0,600);
  await page.waitForFunction(()=>scrollY>100);
  await nav(page,"聚合块");
  await page.locator(".sync-page").waitFor();
  await nav(page,"首页");
  assert.equal(await page.locator('.workspace-actions [data-ui-icon="import"]').count(), 1);
  assert.equal(await page.locator('.continue-panel [data-ui-icon="next"]').count(), 1);
  assert.equal(await page.locator(".followup-row .lucide-arrow-up-right").count(), 0);
  const selected = page.locator('.review-source-picker [aria-pressed="true"]');
  assert.equal(await selected.evaluate(e => getComputedStyle(e).backgroundColor), "rgb(229, 232, 221)");
  await page.locator(".review-source-picker").getByRole("button",{name:"原子问答",exact:true}).click();
  const stage = page.locator(".review-stage"), active = page.locator(".review-card-active");
  await active.locator('.review-card-front .review-flip-button').click();
  await page.waitForFunction(() => document.querySelector(".review-card-active .review-flipper")?.classList.contains("is-flipped"));
  await active.locator('.review-card-back .review-flip-button').click();
  const oldId = await active.getAttribute("data-card-id");
  await stage.focus(); await page.keyboard.press("ArrowRight");
  await page.waitForFunction(id => document.querySelector(".review-card-active")?.dataset.cardId !== id, oldId);
  const newId = await active.getAttribute("data-card-id");
  await page.locator(".review-edge-previous").click();
  await page.waitForFunction(id => document.querySelector(".review-card-active")?.dataset.cardId !== id, newId);
  await stage.focus(); await page.mouse.wheel(130,0);
  await page.waitForFunction(id => document.querySelector(".review-card-active")?.dataset.cardId !== id, oldId);
  await page.getByRole("button", { name: "洗牌", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".review-hero")?.getAttribute("aria-busy") === "false");
  assert.equal(await page.locator(".review-announcement").innerText(), "洗牌完成，新的顺序已就绪");
  const button = page.getByRole("button", { name: "导入面经", exact: true });
  await page.keyboard.press("Tab");
  await button.focus();
  await page.waitForFunction(() => {
    const e = document.activeElement;
    return e?.matches(":focus-visible") && getComputedStyle(e).outlineWidth === "2px";
  });
  await button.click();
  await page.locator(".import-workspace").waitFor();
  await check(page,"dialog/import");
  const input = page.getByRole("textbox", { name: "面试原文", exact: true });
  await input.focus();
  const inputStyle = await input.evaluate(e => ({ shadow:getComputedStyle(e).boxShadow, border:getComputedStyle(e).borderBottomColor }));
  assert.equal(inputStyle.shadow,"none");
  assert.equal(inputStyle.border,"rgb(66, 107, 85)");
  await page.getByRole("button",{name:"返回新建",exact:true}).click();
  await nav(page,"原子问答");
  await page.getByRole("button",{name:"新建原子问答",exact:true}).click();
  const question = page.getByRole("dialog").getByRole("textbox",{name:"问题",exact:true});
  await question.fill("恢复原有逻辑：保存后内容应保留");
  await page.getByLabel("回答第 1 点",{exact:true}).fill("候选人自己的回答。");
  await check(page,"dialog/question");
  await page.setViewportSize({width:390,height:844});
  await check(page,"dialog/question-mobile");
  await page.setViewportSize({width:1440,height:1000});
  // A failed atomic write must keep the original form open for retry.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === "readwrite" && !window.__uiFailedOnce) { window.__uiFailedOnce = true; throw new Error("UI检查：写入失败"); }
      return original.apply(this,args);
    };
  });
  await page.getByRole("dialog").getByRole("button",{name:"添加原子问答",exact:true}).click();
  await page.getByRole("dialog").getByRole("alert").filter({hasText:"UI检查：写入失败"}).waitFor();
  assert.equal(await question.inputValue(),"恢复原有逻辑：保存后内容应保留");
  await page.getByRole("dialog").getByRole("button",{name:"添加原子问答",exact:true}).click();
  await page.getByRole("heading",{name:"恢复原有逻辑：保存后内容应保留",exact:true}).waitFor();
  const saved = await page.evaluate(async () => (await (await import("/src/data/repository.ts")).indexedDbRepository.load()).questions.some(q => q.title === "恢复原有逻辑：保存后内容应保留"));
  assert.equal(saved,true);
  await page.reload();
  await page.getByRole("heading",{name:"恢复原有逻辑：保存后内容应保留",exact:true}).waitFor();
  await check(page,"question/saved");
  await page.evaluate(()=>{
    sessionStorage.setItem("atlas-2.1:view",JSON.stringify("practice"));
    sessionStorage.setItem("atlas-2.1:practice-tab",JSON.stringify("cards"));
  });
  await page.reload();
  await check(page,"practice/cards");
  await page.getByRole("button",{name:"洗牌",exact:true}).click();
  await page.waitForFunction(() => document.querySelector(".review-hero")?.getAttribute("aria-busy") === "false");
  if(output) await capture(page,"practice-1440");
  const mobile = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await seed(mobile);
  await mobile.locator(".review-source-picker").getByRole("button",{name:"原子问答",exact:true}).click();
  const mobileStage = mobile.locator(".review-stage");
  await mobileStage.scrollIntoViewIfNeeded();
  const bounds = await mobileStage.boundingBox();
  const beforeSwipe = await mobile.locator(".review-card-active").getAttribute("data-card-id");
  const cdp = await mobile.context().newCDPSession(mobile);
  const x = bounds.x + bounds.width * .7, y = bounds.y + bounds.height * .5;
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x-120,y}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await mobile.waitForFunction(id=>document.querySelector(".review-card-active")?.dataset.cardId!==id,beforeSwipe);
  await cdp.detach();
  await check(mobile,"touch/swipe");
  await mobile.close();
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
}

for (const zoom of [.75,1,1.25,1.5,1.75,2]) {
  const profile = await mkdtemp(join(tmpdir(),"atlas-ui-zoom-"));
  await mkdir(join(profile,"Default"));
  const level = Math.log(zoom) / Math.log(1.2);
  await writeFile(join(profile,"Default","Preferences"),JSON.stringify({ partition:{ default_zoom_level:{x:level},
    per_host_zoom_levels:{x:{"127.0.0.1":{zoom_level:level,last_modified:String(BigInt(Date.now())*1000n+11644473600000000n)}}} } }));
  const context = await chromium.launchPersistentContext(profile,{executablePath,viewport:null,headless:true,args:[...args,"--window-size=1440,1000"]});
  try {
    const page = context.pages()[0]; await seed(page);
    assert.ok(Math.abs(await page.evaluate(()=>devicePixelRatio)-zoom)<.02,`actual zoom ${zoom}`);
    await pages(page,`zoom-${zoom}`);
  } finally { await context.close(); await rm(profile,{recursive:true,force:true}); }
}
assert.deepEqual(errors,[]);
if(output) await writeFile(join(output,"ui-system-check.json"),JSON.stringify({pages:evidence,errors},null,2));
console.log(`PASS: ${evidence.length} page/dialog checks; shared controls/icons, focus, save, flip, keyboard, wheel, shuffle, fixed header frame stability and boundary scrolling; 10 widths and Chrome 75–200% zoom.`);
