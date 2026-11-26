# 见字·如面 UI 设计规范

版本 1.2 · 2026-11-11 · 适用首页、面试记录、原子问答、聚合块、简历经历、模拟面试、闪卡、搜索、设置与全部弹窗。技术载体为 React + CSS；面向产品设计、前端开发及后续 AI 修改。

本规范是当前产品的通行标准。新页面和修改须先读本文件及 `.uicraft.md`，优先复用 `src/components/UI.tsx`。`src/ui-system.css` 是控件样式与尺寸的唯一来源；页面 CSS 负责布局，不重新定义按钮、图标、选中态与焦点样式。

产品逻辑恢复为 2.0 已实现的独立模块，当前信笺 UI 仅承载已有能力。[Data-backed] 一级入口为首页、面试记录、原子问答、聚合块、简历经历、练习；练习保留闪卡复习、模拟面试、历史复盘三个子页，模拟面试直接进入配置页。导入、录音、AI 提取与人工审核沿原流程进入面试记录；来源面试、关联聚合块、关联简历经历使用具体对象名称。不再提供通用知识库编辑器、“对照资料”“管理关联”，也不新增“整理工作台”等抽象工作流。后续设计须遵循用户这次纠正，不能通过换词重新引入上述逻辑。完整约定见 `docs/product/resource-product-logic.md`。

## 设计判断与目标

当前产品的暖纸、信笺与深绿方向成立，问题出在公共控件缺少约束。此次对首页、整理、知识库、模拟配置、设置的桌面与手机实际样式采样，发现操作控件混用 30、34、36、38、40、42、44px 高度；图标出现 12–20px 尺寸及 1.4、1.7、2 等不同线宽。首页来源选择是黑色胶囊，主操作是绿色矩形，洗牌又是绿色胶囊，同一层级显得不同源。[Data-backed]

改为克制、可辨认的工作台：内容居主位，颜色表达状态，形状表达控件类别。动作按钮保持一致；列表行、导航、开关与闪卡场景各有合理结构，不强行做成按钮矩形。[Expert judgment]

用户进一步指出横向分隔过多，列表与详情中间叠出多条竖线。[Data-backed] 因此分组优先使用留白、字号与对齐；相邻布局区域不各自画一圈外框，列表行不逐条画线，工具区不重复套框。一个边界确需分隔时最多一条线。静止滚动条的轨道与滑块保持透明，悬停或键盘操作时才显出滑块。[Expert judgment]

保留用户已确认的暖纸、墨绿、低调搜索、瘦高闪卡、两侧卡流、翻面、滑动及洗牌动画。[Data-backed] 32／40／44px 取自产品已有尺寸档位，8px 圆角和 14／16／18／20px 图标取自已有控件；此次统一选择是产品设计决策，不代表外部研究结论。[Data-backed][Expert judgment]

## 基础变量

沿用已有颜色语义变量；新增公共变量采用 `--ui-{类别}-{用途或档位}`。组件只消费变量。不要在页面根节点创建另一套配色。颜色定义延续既有产品，新增主题必须统一改变变量映射。[Data-backed]

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--paper` | `#f8f7f3` | 页面暖纸底色 |
| `--surface` | `#fdfcf8` | 表面与弹窗 |
| `--surface-soft` | `#f2f3ec` | 中性悬停 |
| `--ink` / `--ink-soft` | `#1c1b18` / `#3b3a35` | 正文 / 次级正文 |
| `--muted` | `#6b6960` | 辅助说明 |
| `--line` | `#dedfd5` | 细分隔线 |
| `--primary` | `#254438` | 主操作与品牌 |
| `--primary-hover` / `--primary-pressed` | `#345747` / `#19352a` | 悬停 / 按下 |
| `--primary-soft` | `#e5e8dd` | 筛选、列表、页签选中 |
| `--danger` / `--danger-soft` | `#b23a3a` / `#f8e3e0` | 删除、清空、错误 |
| `--ui-focus` | `#426b55` | 键盘焦点与输入下划线 |
| `--ui-space-1/2/3/4/6/8` | 4 / 8 / 12 / 16 / 24 / 32px | 间距档位 |
| `--ui-radius-control` | 8px | 操作、选择控件 |
| `--ui-radius-panel` | 12px | 弹窗 |
| `--ui-control-compact/default/prominent` | 32 / 40 / 44px | 桌面控件高度 |
| `--ui-font-compact/control` | 13 / 14px | 紧凑 / 普通操作文字 |
| `--ui-icon-meta/action/control/nav` | 14 / 16 / 18 / 20px | 说明 / 文字操作 / 图标按钮 / 导航 |
| `--ui-icon-stroke` | 1.75 | Lucide 24×24 viewBox 内线宽 |
| `--dur-fast` / `--dur` | 130 / 190ms | 颜色反馈 / 常规过渡 |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | 平滑减速 |
| `--shadow-sm` | 既有轻影 | 小浮层，操作按钮不加阴影 |
| `--shadow` | 既有纸张浮影 | 浮层、纸张，不用于普通悬停 |

中文正文用系统无衬线字体，英文用 Inter。正文 14px，阅读行高 1.8–2；表单标签 13px，辅助信息 12px。页标题可用既有宋体，建议 28–36px；区块标题 20–24px。装饰性衬线体不用于按钮与表单。[Data-backed][Expert judgment]

正文对比度按 WCAG AA 的 4.5:1 为目标；小字号不使用 `--muted-light` 承载必要信息。禁用状态通过原生 disabled 及透明度表达。当前主题只有暖纸模式，未增加未经设计的暗色模式。

## Button

表达动作。一个操作组只放一个主按钮；导入、录制、查看等辅助动作按当前流程选择 secondary 或 text。洗牌居中，仅显示中性色图标与文字，不使用强调色、实心背景或边框；维持原有 132×44px 点击热区。使用 quiet 变体与 prominent 尺寸，尺寸不代表必须视觉强调。[Data-backed]

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `variant` | `primary / secondary / quiet / danger / text` | secondary | 语义层级 |
| `size` | `compact / default / prominent` | default | 高度与横向留白 |
| `icon` / `trailingIcon` | `UIIconName` | 无 | 左侧动作 / 右侧方向 |
| `loading` | boolean | false | 禁止重复操作，设置 aria-busy |
| `disabled` | boolean | false | 原生禁用 |
| `type` | `button / submit / reset` | button | 表单提交须显式 submit |
| `children` | ReactNode | 必填 | 简短、明确的动作标签 |
| 其他 | 原生 button 属性 | 无 | onClick、ref、aria-* 等 |

| 变体 | 表达 | 使用 |
| --- | --- | --- |
| primary | 墨绿底、暖白字 | 开始、保存、下一步 |
| secondary | 纸色底、细边线 | 导入、切换、分享 |
| quiet | 透明底、正文色 | 取消、跳过 |
| danger | 浅红底、红字 | 删除、清空 |
| text | 透明底、绿字、紧凑高度 | 查看、关联、返回 |

所有动作按钮 8px 圆角；默认文字 14px、500 字重、20px 行高，图文间距 8px。紧凑按钮 13px、32px 高，默认 40px，突出操作 44px；普通横向留白 16px，突出操作 24px。按钮不依赖浮起、缩放或阴影表达悬停。

默认、悬停、按下、聚焦、禁用、忙碌必须完整：

- 悬停与按下只改变背景、文字和边线；主操作使用既有 hover / pressed 色。
- 键盘聚焦显示 2px 绿色实线，向外偏移 3px；鼠标操作不额外绘制厚光圈。
- disabled 透明度 .45，不进入悬停，原生不可点击。
- loading 设置 disabled 与 aria-busy；已有左图标替换为旋转图标，标签保持原样，宽度不跳动。进度或错误通过附近 `role="status"` / `role="alert"` 说明。
- 320px 窄屏无法容纳时操作组换行，不压扁图标或截断标签。

```tsx
<Button variant="primary" icon="save" loading={busy} onClick={save}>
  保存修改
</Button>
<Button variant="text" trailingIcon="next" onClick={open}>查看详情</Button>
<Button type="submit" variant="primary">保存并进入整理</Button>
```

不要用胶囊表示普通动作；不要混入 Emoji 图标；不要给同组按钮单独设置字号、圆角、线宽；不要为每个按钮都加图标，只有能帮助识别的动作才添加。

## IconButton 与 UIIcon

IconButton 是无文字的操作，例如关闭、收藏、上一条与下一条。与 Button 共用状态规则，默认 40×40px、18px 图标；紧凑 32×32px，必须提供可读 label。收藏可填充星形，其他操作默认线框。

| 组件 | 属性 | 类型与默认 | 说明 |
| --- | --- | --- | --- |
| IconButton | icon / label | UIIconName / string，必填 | 图标与无障碍名称 |
| IconButton | size | default | compact / default |
| IconButton | selected | false | 是否填充图形，状态语义同时传 aria-pressed |
| IconButton | 其他 | 原生 button 属性 | disabled、onClick、aria-* |
| UIIcon | name | UIIconName，必填 | 按动作或资料类型选择 |
| UIIcon | scale | action | meta / action / control / nav |
| UIIcon | 其他 | LucideProps | 不提供 size / strokeWidth；填色继承文字 |

```tsx
<IconButton icon="close" label="关闭弹窗" onClick={close}/>
<IconButton icon="favorite" label="收藏" selected={favorite} aria-pressed={favorite}/>
<UIIcon name="question" scale="meta"/>
```

命名按语义，不包含尺寸、颜色和页面名。来源为现有 Lucide 库，24×24 viewBox、统一 1.75 线宽、currentColor。新用途先扩展 `uiIcons`，再同步文档与图例；不要逐页选择近似图形。

| 语义名 | 图形 | 说明 |
| --- | --- | --- |
| add / import / export | Plus / Upload / Download | 新建 / 导入 / 导出 |
| save / confirm | Save / Check | 保存修改 / 确认并继续 |
| ai / record / retry | Sparkles / Mic / RotateCcw | AI / 录制 / 重试 |
| share / delete | Share2 / Trash2 | 分享 / 删除 |
| next / back / external | ArrowRight / ArrowLeft / ArrowUpRight | 站内前进 / 返回 / 外部链接 |
| close / search / settings | X / Search / Settings | 关闭 / 搜索 / 设置 |
| compare / relation | BookOpen / Link2 | 对照 / 关联 |
| favorite / flip / shuffle | Star / Rotate3D / Shuffle | 收藏 / 翻面 / 洗牌 |
| loading | LoaderCircle | 异步忙碌状态 |
| interview / question / sync / resume | FileText / MessageSquareText / Layers / FileUser | 面经 / 问答 / 聚合块 / 经历 |

这张表为公共语义映射。历史编辑工具栏、服务商品牌与空状态插画继续使用现有库，但遵守统一线宽；它们没有被迁移为独立公共组件。装饰图形可保留大尺寸，不参与动作图标档位。

## 选择、导航与列表

页签和分段选择桌面最小高度 32px、13px 字号、8px 圆角；选中使用浅绿底和深绿字。筛选支持 aria-pressed，展开入口用 aria-expanded。导航用 aria-current 表达位置；一级导航保留一条绿色位置下划线。

一级导航、资料行与开关保留自身布局，不按 Button 定高。列表标题自动换行、元信息另行排布；活动行用浅绿、文字与状态语义表达选中，不重复添加左侧竖线。数字徽标只作为补充，不以色彩作为唯一信息。

全站顶部品牌、一级导航与搜索所在的整条栏固定在视口顶部（`position: fixed; inset: 0 0 auto`），滚动过程及到顶、到底时均不得随正文回弹或抖动。工作区根滚动容器使用 `overscroll-behavior: none` 禁用页面边界回弹。导航栏保持不透明纸色背景，层级低于弹窗。使用 `ResizeObserver` 将实际栏高写入 `--workspace-header-height`；工作区顶部内边距按此高度为导航留位，桌面问题目录、模拟会话标题及问题跳转的留白也使用该变量，避免被导航遮挡。窄屏问题目录随正文滚动，不额外占据顶部。验收必须实际滚动、反向滚动、触达上下边界并逐帧确认导航位置不变且可点击，不能只检查滚动结束后的坐标，也不能以问题目录或练习方式栏代替。

## 表单、弹窗与反馈

- 搜索采用图标、文字和一条下划线；只有外层绘制下划线，聚焦只变色，不出现内外双框或光环。
- 普通输入、选择和长文本编辑静止时融入纸面，不逐字段画线；悬停轻微变底色，聚焦时仅当前字段出现绿色下划线，标签放上方。富文本编辑仅外层提供焦点线，内部文本框不重复画线。
- checkbox / radio 保留原生形状、绿色 accent；不得受通用 input 拉伸影响。开关用 aria-checked 和文字表达状态。
- 搜索保留常驻的单下划线。其他输入焦点通过临时下划线显现；按钮焦点通过外轮廓显现，不完全移除键盘反馈。
- 弹窗用 12px 圆角，标题与内容通常留白 24px，窄屏 20px。使用 `Modal`，保持焦点限制、Escape 关闭与关闭后回焦点。长内容滚动，底部动作不能挡住编辑内容。
- 成功用 status，错误用 alert，文案写明结果及可执行下一步。保存失败保留草稿，重试不丢失内容。危险操作沿用现有确认机制。

## 页面组合与响应式

```text
一级导航与搜索
  → 页面标题 / 主操作
  → 选择与筛选
  → 当前模块内容
  → 编辑 / 保存，以及具体来源或关联对象
```

| 场景 | 组合规则 |
| --- | --- |
| 首页 | 保留当前闪卡与最近内容；导入、模拟面试和待审核入口直接进入已有功能 |
| 面试记录 | 搜索 / 筛选 / 已有集合 → 面试详情 → 编辑基础信息、原子问答、AI 审核；原文按需展开 |
| 原子问答 | 搜索 / 来源 / 时间筛选 → 问答详情 → 编辑回答与笔记；来源面试、聚合块、简历经历按具体对象跳转 |
| 聚合块 | 目录 → 正文与复习笔记；页面标题、搜索区与目录标题随页面滚动，不吸顶；正文完整展开，目录标题与条目不重叠；点击正文使用原有就地编辑，关联问答按需展开 |
| 简历经历 | 经历列表 → 展开经历 → 编辑、关联问答 / 聚合块；沿用解析简历和人工新增 |
| 模拟面试 | 原有面试间 → 配置 / 会话 / 历史与报告；首页共享闪卡继续使用 |
| 设置 | 分组、说明、动作；同类操作等宽对齐 |
| 无数据 / 无匹配 | 解释当前状态及单个下一步 |
| 保存或模型失败 | 内容保留、错误明确、支持重试 |

≤650px 或粗指针设备，紧凑及默认档位提升到 44px；图标保持原尺寸，不同比例缩放。六个一级导航分为三列两行，列表与详情收敛为单栏。操作组允许换行。650–1040px 顶部搜索与品牌一行，导航独立一行；更宽时一级导航居中，宽屏保留合理最大内容宽度。换行、窗口缩放和字体加载后，正文留位及下方吸顶偏移随导航栏实际高度更新。

闪卡比例、倾斜、翻面、边缘导航与洗牌属于场景设计；动作文字、图标与按钮遵守公共规则。两侧卡片不得被裁断，长问题与回答能完整滚动。保留键盘、触控板横滑、按钮与触摸切换。`prefers-reduced-motion` 保留功能并降低运动。

## 修改与验证

公共规则变更先改本规范、UI.tsx / ui-system.css，再更新使用方；页面新增差异须说明用途，不能用追加样式覆盖公共控件。颜色、尺寸、线宽通过变量和组件变更，不散落硬编码。文档优先级高于旧主题说明。

```bash
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

浏览器检查使用独立示例数据，覆盖六个一级入口、面试与问答详情、设置、导入和问答弹窗；检查颜色、尺寸、图标、焦点及保存、翻面、切换、洗牌。覆盖 320–1904px 窗口与 Chrome 原生 75%–200% 缩放。不可修改用户日常工作区数据。

Mac／Safari 与手机 WebKit 的补充检查：`npx playwright install webkit` 后执行 `npm run test:webkit`，覆盖桌面、平板、390／320px 手机布局、闪卡与保存刷新。闪卡正反面必须建立明确的 3D 变换，避免 WebKit 在静止正面显示镜像背面文字。

`check-theme-consistency.mjs` 转接到当前页面检查；旧脚本需适配当前顶部导航后才能用于验收。截图与检查结果可以通过 `SCREENSHOT_DIR` 保存。

离线控件图例由 `scripts/generate-ui-guide.mjs` 从实际 React 组件及 CSS 生成，输出目录准备好 `assets/` 与 `_shared/fonts/` 后执行：

```bash
node scripts/generate-ui-guide.mjs /absolute/path/to/UI设计规范
```

图例需要本地 `InstrumentSans-Regular.ttf`（含 OFL 许可）；产品本身继续使用原有 Inter 与中文系统字体。不要手动改出一套与产品不同的图例控件样式。
