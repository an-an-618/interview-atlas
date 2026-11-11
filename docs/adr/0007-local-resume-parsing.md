# ADR 0007: Local resume reading and LLM experience extraction

- Status: Accepted (dependency review completed for the user-authorized 2.0 release)
- Date: 2026-11-10
- Accepted: 2026-11-11

## Context

经历模块需要从用户的 Word、PDF 和其他简历文件生成可编辑的结构化经历。全局 AI 接口采用 OpenAI-compatible Chat Completions；各模型的原生文件上传能力不一致，且部分预设只支持文本。沿用 [ADR 0003](0003-ai-provider-boundary.md) 的用户自备凭据、用户触发和本地存储边界。

## Decision

- Word `.docx` 使用 `mammoth@1.13.0` 的浏览器入口 `extractRawText`，不转换或渲染文件里的 HTML，不执行宏，不读取外链图片。
- PDF 使用 Mozilla `pdfjs-dist@6.5.438`。从内存字节读取可提取文字的 PDF，逐页提取，不渲染 PDF。Worker 和中文等 CMap 资源随应用打包；CMap 禁止 Vite 内联为 data URL，避免桌面 CSP 的 `connect-src` 拦截。
- PDF 的自定义二进制资源工厂只允许随包的 CMap 字典，不接受文件提供的远程资源地址；关闭 worker fetch、Wasm 和字体渲染。无需新增桌面文件权限或放宽 CSP。
- TXT、Markdown 使用浏览器 UTF-8 解码。PNG、JPEG、WebP 将内存字节变为 data URL，通过 OpenAI-compatible `image_url` 发送；界面额外要求用户确认模型支持图片。它们并非各模型都可用。
- 旧 `.doc`、加密 PDF、无可提取文字的 PDF 页、无效格式、空文件、超过 10 MB 文件、超过 30 页 PDF 或超过 100,000 字符的文字明确报错，不截断、不调用模型。扫描 PDF 可先 OCR 后导出文字，或逐张上传图片。含少量文字的扫描页仍可能遗漏图片内容，需用户核对。
- UI 显示当前全局 endpoint/model、发送的内容类别和授权复选框。选择文件只在本机读取；点击同意并解析才直连配置的 API。
- 文案明确模型服务商可读取简历，可能按其政策留存；见字·如面不将简历或结果上传到自身服务器或其他云端存储，原文件不由应用保存。仅确认的经历写入本地工作区。
- Provider 边界提供 `extractResume`。只发送所选文件文字或图片，不带其他经历、整个工作区或文件名；Key 沿用会话级保存，仅作为鉴权请求头。
- JSON 结果逐条验证类型、字段、要点、长度和原文引用；文本引用通过 Unicode/空白归一在原文核对。图片引用仅展示供用户核对，未经过 OCR 独立验证。任何无效条目使整个结果失败，避免悄悄丢弃部分经历。
- 所有结果先留在弹窗内存供编辑、勾选，再一次性追加到当前经历库。已有同标题、组织和时间的经历及批内重复结果默认取消勾选并标记。允许用户明确选择重复项，不覆盖或合并既有内容。
- 本地保存完成后才关闭弹窗；失败保留结果供重试。关闭弹窗或离开经历模块取消读取/解析；晚到的 API 结果不能写入工作区。

## Alternatives

模型原生 `/files` 上传会让基础能力依赖具体服务商，且增加临时远端文件的管理与清理义务；本次不接入。云端 OCR/文件转换引入额外简历接收方，不符合这次告知范围。本机 OCR、批量图片和扫描 PDF 自动渲染可另行扩展。

## Dependency review

| Dependency | Reviewed version | Owner / license | Runtime behavior |
| --- | --- | --- | --- |
| Mammoth | 1.13.0 | `mwilliamson/mammoth.js` / BSD-2-Clause | 浏览器入口在内存解压 DOCX、读取 XML；不持有 API Key；不调用云服务。发布包不需要执行构建脚本；源码 `prepare` 用于生成浏览器 bundle。 |
| PDF.js | 6.5.438 | `mozilla/pdf.js` / Apache-2.0 | 官方 Mozilla PDF 解析库；仅应用内 Worker 和随包 CMap 的本地请求；不持有 API Key；不调用遥测或云服务。npm 包没有 scripts；可选 Node Canvas 在前端路径不用。 |

版本固定在 package.json 和 lockfile。安装从配置的 npm registry 取得包；运行时不新增文件系统、子进程或凭据权限。`npm audit` 未报告这两项及其生产依赖的漏洞；现有 Vite/Vitest 开发依赖仍有公告，本次未跨范围升级。

移除步骤：删除解析入口、`src/documents`、`extractResume` 及导入弹窗；卸载两个依赖。已导入经历采用原有 schema，仍可手动编辑，不需数据迁移。

## Consequences and validation

文件提取可能受排版、多栏、图片、字体和模型能力影响；原文引用可定位也不保证每个要点完全准确。需要真人核对，服务商上下文不足或拒绝图片输入时显示错误。

按需加载 Word/PDF 解析器，避免所有页面启动时下载解析库。PDF Worker 和 CMap 增加约数 MB 安装资源。

单元测试涵盖 DOCX 段落/表格、UTF-8、文件限制、结构与证据验证、仅发送所选简历、图片 schema、取消、JSON 兼容回退和批量追加。生产构建的浏览器测试使用虚构样本与本机模拟 API，并应用真实桌面 CSP，覆盖中文 PDF、读取不请求 API、授权、编辑后只导入勾选项、重复条目、保存失败恢复、重载持久化、解析失败/截断/空结果、取消和桌面/移动布局。

See [reproducible checks](../engineering/resume-import.md).
