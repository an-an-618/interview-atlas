import type { Workspace } from "../domain/types";

const createdAt = "2026-09-30T09:00:00.000Z";

export const createDemoWorkspace = (): Workspace => ({
  interviews: [
    {
      id: "sample-interview",
      company: "星河科技",
      role: "前端工程师",
      round: "技术二面",
      date: "2026-09-28",
      source: "示例内容",
      rawText:
        "先聊了项目中的性能治理，然后追问浏览器事件循环，以及和产品意见不一致时如何处理。",
      status: "reviewed",
      questionIds: ["sample-event-loop", "sample-collaboration"],
      createdAt,
      updatedAt: createdAt,
      sample: true,
    },
  ],
  questions: [
    {
      id: "sample-event-loop",
      title: "浏览器事件循环如何工作？",
      answer:
        "先说明任务队列与调用栈，再解释一次宏任务、清空微任务和渲染时机。",
      notes: "补充浏览器渲染前后的微任务执行顺序。",
      tags: ["JavaScript", "基础"],
      sourceInterviewIds: ["sample-interview"],
      linkedSyncBlockId: "sample-sync",
      createdAt,
      updatedAt: createdAt,
      sample: true,
    },
    {
      id: "sample-collaboration",
      title: "和产品意见不一致时如何处理？",
      answer:
        "使用真实项目说明如何对齐目标、量化风险、提出替代方案并复盘结果。",
      notes: "",
      tags: ["行为面", "协作"],
      sourceInterviewIds: ["sample-interview"],
      linkedSyncBlockId: null,
      createdAt,
      updatedAt: createdAt,
      sample: true,
    },
  ],
  syncBlocks: [
    {
      id: "sample-sync",
      title: "事件循环：从执行栈到渲染",
      body:
        "回答按三层展开：执行栈与任务队列、微任务清空时机、浏览器渲染机会。最后结合一个 Promise 与 setTimeout 的例子。",
      reviewNotes: "下次补充 requestAnimationFrame 与微任务的先后关系。",
      linkedQuestionIds: ["sample-event-loop"],
      pinned: false,
      hidden: false,
      createdAt,
      updatedAt: createdAt,
      sample: true,
    },
  ],
  resumeExperiences: [
    {
      id: "sample-resume-internship",
      type: "实习",
      title: "星河电商前端 · 实习",
      organization: "星河科技",
      period: "2025-11 → 2026-06",
      bullets: [
        "负责商详性能治理，将核心页面 LCP 从 2.4s 降至 1.3s",
        "推动 CSS containment 上线，滚动长任务耗时下降 66%",
        "牵头跨端埋点方案讨论，沉淀 3 份决策记录",
      ],
      linkedQuestionIds: ["sample-event-loop", "sample-collaboration"],
      linkedSyncBlockIds: ["sample-sync"],
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "sample-resume-open-source",
      type: "项目",
      title: "开源项目 · bundler-lab",
      organization: "个人",
      period: "2026-01 → 至今",
      bullets: [
        "为构建工具生态贡献 3 个性能补丁",
        "撰写构建原理系列文章，累计阅读 5.2 万",
      ],
      linkedQuestionIds: ["sample-event-loop"],
      linkedSyncBlockIds: [],
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "sample-resume-commerce",
      type: "项目",
      title: "星河电商前端 · 长期迭代",
      organization: "星河科技",
      period: "2026-03 → 2026-06",
      bullets: [
        "接手商品详情重构，主导服务端渲染迁移",
        "解决 3 起 hydration mismatch 线上问题",
      ],
      linkedQuestionIds: [],
      linkedSyncBlockIds: ["sample-sync"],
      createdAt,
      updatedAt: createdAt,
    },
  ],
  aiReviews: [],
  reviewEvents: [],
});
