# Interview Atlas（千面）

> 把散落的面经整理成可回溯、可复用、可持续修订的个人面试知识库。

[English](README.md) · [下载安装](https://github.com/an-an-618/interview-atlas/releases) · [产品上下文](docs/product/product-context.md) · [一期 PRD](docs/product/prd-v1.md) · [架构决策](docs/adr/README.md)

[![CI](https://github.com/an-an-618/interview-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/an-an-618/interview-atlas/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19.3-149ECA)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6)
![Storage](https://img.shields.io/badge/storage-IndexedDB-6B7D3A)
![Desktop](https://img.shields.io/badge/macOS_%7C_Windows-Tauri_2-24C8DB)

![千面概览页](docs/assets/interview-atlas-overview.png)

## 它如何工作

千面把原始面经视为证据，把每一次真实问答拆成原子实例，再把反复出现的问题连接到维护稳定回答的同步块。AI 只生成候选，任何入库和关联都由用户确认。

```text
面试记录 → 原子问答 → 同步块 → 复习
   │           │          │
 原始证据     具体实例    稳定回答
```

当前应用已经支持：

- 同一套 React 代码适配 PC 与 H5；
- 使用 Tauri 2 生成 Apple Silicon macOS `.app` 与 `.dmg`；
- 使用 Tauri 2 生成 Windows x64 NSIS `.exe` 与 MSI 安装包；
- 使用浏览器原生 IndexedDB 保存本地工作区；
- 导入面经、手动拆解与 AI 辅助拆解审核；
- 独立创建和编辑原子问答的问题、答案与笔记；
- 显式建立同步块与原子问答的双向关系；
- 简历经历的增删改查、关系管理与修改 Diff 预览；
- 每日一问、每日推荐同步块和 AI 待审核队列；
- 版本化 JSON 导出、显式示例数据与工作区清空；
- OpenAI-compatible 模型服务与仅会话保存的 API Key。

## 产品原则

- **原文是证据。** 派生内容不能替代或覆盖来源。
- **AI 建议，用户决策。** 不静默覆盖、合并、关联或删除内容。
- **默认本地保存。** 工作区保存在 IndexedDB，只有用户主动导出才会离开浏览器。
- **AI 请求必须显式触发。** 仅将当前任务需要的内容直连发送给用户配置的服务商。
- **无 AI 也能完整使用。** 手动整理、关联、复习和导出流程保持可用。

## macOS 下载安装

当前桌面预览版支持 Apple Silicon Mac，系统要求为 macOS 13 及以上。

1. 打开 [GitHub Releases](https://github.com/an-an-618/interview-atlas/releases)，下载最新的 `Interview-Atlas_<版本>_aarch64.dmg` 和 `SHA256SUMS.txt`。
2. 打开 DMG，将“千面.app”拖到“Applications”快捷入口。
3. 当前预览版尚未经过 Apple 公证。首次启动时，在 Finder 中右键“千面.app”，选择“打开”，再确认一次“打开”。必要时前往“系统设置 → 隐私与安全性 → 仍要打开”。
4. 后续可从“应用程序”、Spotlight、启动台或 Dock 打开千面。

不要关闭系统级 Gatekeeper。可在下载目录执行以下命令校验安装包：

```bash
shasum -a 256 -c SHA256SUMS.txt
```

桌面版与浏览器版使用独立的 IndexedDB 工作区，浏览器数据不会自动迁移。维护者构建、正式签名与 Apple 公证流程见 [macOS 构建与发布](docs/engineering/macos-distribution.md)。

## Windows 下载安装

Windows 预览版支持 x64 Windows 10/11。打开一次成功的 [CI 运行](https://github.com/an-an-618/interview-atlas/actions/workflows/ci.yml)，下载 `interview-atlas-windows-x64` 产物并运行其中的 NSIS `*-setup.exe`；压缩包内也提供适合管理部署的 MSI。

当前预览版尚未进行 Authenticode 签名，Microsoft Defender SmartScreen 可能在首次启动时提示风险。构建、安装与后续签名说明见 [Windows 构建与发布](docs/engineering/windows-distribution.md)。

## 本地运行

环境要求：Node.js 24、npm 11。

```bash
npm ci
npm run dev
```

Vite 会在终端输出本地访问地址。项目不需要后端服务或账号系统。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务 |
| `npm run desktop:dev` | 启动桌面开发模式 |
| `npm run desktop:build:macos` | 生成 macOS `.app` 与 `.dmg` |
| `npm run desktop:build:windows` | 生成 Windows NSIS 与 MSI 安装包 |
| `npm test` | 运行 Vitest 测试 |
| `npm run typecheck` | 执行 TypeScript 类型检查 |
| `npm run build` | 生成生产构建 |

桌面构建还需要 Rust 与对应平台的构建工具。具体说明见 [macOS](docs/engineering/macos-distribution.md) 和 [Windows](docs/engineering/windows-distribution.md) 构建与发布文档。

## 技术架构

- React 19.3、TypeScript 7、Vite 8
- `src/domain/` 承载不依赖框架的领域规则
- `src/data/` 通过 repository 边界封装原生 IndexedDB
- `src/ai/` 封装可选的 OpenAI-compatible 接口
- `src-tauri/` 提供轻量 macOS 与 Windows 桌面外壳
- Inter、Source Serif 4、JetBrains Mono 字体本地打包
- 无服务端依赖的响应式 PC/H5 界面

## 仓库导航

| 路径 | 内容 |
| --- | --- |
| `src/` | 应用、领域规则、持久化、AI 边界与测试 |
| `src-tauri/` | macOS 与 Windows 桌面外壳、Bundle 配置与应用图标 |
| `docs/product/` | 产品上下文、已批准 PRD 与 AI 能力规划 |
| `docs/adr/` | 已接受的架构决策记录 |
| `docs/engineering/` | 交付与第三方能力政策 |
| `.github/` | Issue 表单与 Pull Request 模板 |
| `AGENTS.md` | 贡献者与编码 Agent 的仓库规则 |

参与开发前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，安全与隐私问题请按 [SECURITY.md](SECURITY.md) 提交。

## 一期边界

当前是持续开发中的基础版本，不是托管在线服务。桌面预览支持 Apple Silicon macOS 与 x64 Windows；Linux、Intel/Universal macOS、正式签名、公证和自动更新仍待后续实现。一期明确不包含云同步、多人协作、企业端、自动投递、录屏、视频和实时转写。
