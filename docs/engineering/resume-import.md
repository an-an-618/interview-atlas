# 简历文件解析与经历导入

经历模块的「解析简历」读取所选文件，沿用全局模型设置和当前服务商的会话 API Key。它将结果放到可编辑的预览中，仅确认勾选后新增本地经历。已有手动录入和编辑功能继续可用。

支持 `.docx`、可提取文字的 PDF、UTF-8 TXT / Markdown，以及明确确认视觉能力后的 PNG / JPEG / WebP。最大 10 MB；PDF 最大 30 页；文字最大 100,000 字符。旧 `.doc` 需另存为 `.docx`；扫描 PDF 需先 OCR，或逐张上传图片。原文引用、职责、数字、日期和遗漏均需人工核对。

上传前可查看数据处理说明、模型和 endpoint。选择文件不调用 API；点击解析前需勾选授权。说明区明确简历将被所配置模型服务商读取，千面自身无简历云端存储；不能对服务商的留存政策作承诺。

代码边界与依赖选择见 [ADR 0007](../adr/0007-local-resume-parsing.md)。原文件、完整提取文字、图片 data URL、API Key 与未导入候选均不进入工作区存储或备份；确认的结构化经历使用既有 schema，无存储版本升级。

运行：

```bash
npm ci
npm test
npm run build
```

完整界面验证使用已安装的 Playwright 和 Chrome：

```bash
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node scripts/check-resume-import.mjs
```

未指定 `PLAYWRIGHT_MODULE` 时尝试解析本地 `playwright` 包。可用 `CHROME_PATH` 指定 Chrome 路径，`RESUME_CHECK_DIR` 指定截图位置，默认 `/tmp/atlas-resume-check`。脚本自行启动短期本机 HTTP 服务，在独立无用户数据的浏览器上下文运行生产构建；不需要真实 API Key，也不向外部模型发请求。Chrome 使用 mock keychain，并在完成或失败后结束自动化进程。

脚本包含真实 DOCX 和中文 CMap PDF 内存样本，并验证：

- 生产桌面 CSP 下读取完整中文 PDF，CMap/Worker 不依赖 CDN；
- API 授权、global endpoint/model、凭据只在请求头和会话中；
- 所选文字或图片输入 schema，不发送其他工作区内容；
- 预览不写入、编辑/勾选后追加、原内容不变、重载持久化；
- 本地保存失败保留候选和编辑供重试；
- 重复条目标记、无效/扫描文件、API 错误、截断、空结果与取消；
- 1440、390、320 像素布局、固定可见的操作区，无额外外部请求或页面异常。

真实服务商的模型准确性、图片能力、额度和跨域策略需用该服务商实际验证。本机模拟 API 测试验证协议与应用流程，不代表真实模型提取质量。
