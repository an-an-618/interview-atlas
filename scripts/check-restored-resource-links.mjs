import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  args: ["--use-mock-keychain", "--password-store=basic"],
});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror",e=>errors.push(e.message));
  const nav = name=>page.getByRole("navigation",{name:"一级导航"}).getByRole("button",{name,exact:true}).click();
  await page.goto(process.env.APP_URL ?? "http://127.0.0.1:43118");
  await page.locator(".workspace-global-header").waitFor();
  const ids = await page.evaluate(async()=>{
    const workspace = (await import("/src/data/demo.ts")).createDemoWorkspace();
    await (await import("/src/data/repository.ts")).indexedDbRepository.save(workspace);
    sessionStorage.clear();
    return {interview:workspace.interviews[0].id,question:workspace.questions[0].id,
      sync:workspace.syncBlocks[0].id,resume:workspace.resumeExperiences[0].id,
      unlinked:workspace.questions.find(q=>!q.linkedSyncBlockId).id};
  });
  const stored=()=>page.evaluate(async()=>(await (await import("/src/data/repository.ts")).indexedDbRepository.load()));
  const before=await stored();
  for(const [kind,selector] of [["interview",".interview-detail-page"],["question",".question-detail-page"],["sync",".sync-detail"],["resume",".resume-card.expanded"]]){
    await page.evaluate(({kind,id})=>{
      sessionStorage.setItem("atlas-2.1:view",JSON.stringify("knowledge"));
      sessionStorage.setItem("atlas-2.1:knowledge-target",JSON.stringify({kind,id}));
      sessionStorage.setItem("atlas-2.1:organize-selected",JSON.stringify("obsolete-selection"));
    },{kind,id:ids[kind]});
    await page.reload();
    await page.locator(selector).waitFor();
    assert.equal(await page.getByRole("button",{name:/^(对照资料|管理关联)$/}).count(),0);
  }
  assert.deepEqual(await stored(),before,"reopening legacy selections preserves all workspace data");
  await nav("面试记录");
  await page.locator(".interview-open").first().click();
  await page.getByRole("button",{name:"关联到聚合块",exact:true}).first().click();
  const dialog=page.getByRole("dialog",{name:"关联到聚合块",exact:true});
  await dialog.getByRole("radio").first().check();
  await dialog.getByRole("button",{name:"确认关联",exact:true}).click();
  await page.locator(".sync-detail").waitFor();
  let workspace=await stored();
  const linked=workspace.questions.find(q=>q.id===ids.unlinked);
  assert.ok(linked.linkedSyncBlockId);
  assert.ok(workspace.syncBlocks.find(b=>b.id===linked.linkedSyncBlockId).linkedQuestionIds.includes(linked.id));
  await page.locator(".linked-questions-toggle").click();
  await page.locator(".linked-questions-section .linked-question-row").filter({hasText:linked.title}).click();
  await page.locator(".question-detail-page").waitFor();
  await page.getByRole("button",{name:"返回聚合块",exact:true}).click();
  await page.locator(".sync-detail").waitFor();
  await page.reload();
  await page.locator(".sync-detail").waitFor();
  workspace=await stored();
  assert.equal(workspace.questions.find(q=>q.id===linked.id).linkedSyncBlockId,linked.linkedSyncBlockId);
  assert.equal(workspace.syncBlocks.find(b=>b.id===linked.linkedSyncBlockId).body,
    before.syncBlocks.find(b=>b.id===linked.linkedSyncBlockId).body,"linking retains the original aggregate answer");
  await nav("简历经历");
  await page.locator(".resume-card-main").first().click();
  await page.locator(".resume-card.expanded").waitFor();
  assert.deepEqual(errors,[]);
  console.log("PASS: legacy tab migration for all four resources preserves data; original association picker, both relation directions, return navigation and reload persistence.");
} finally {await browser.close();}
