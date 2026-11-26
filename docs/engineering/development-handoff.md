# 跨电脑开发交接

当前发布：2.1.0（2026-11-26）。GitHub `main` 保存完整可继续开发的源码；`v2.1.0` 固定本次发布代码。GitHub Release 的安装包与 Web 文件由同一标签构建。无需旧电脑的 `.tools`、`node_modules`、构建缓存或聊天记录。

## 在新电脑继续

安装 Git、Node.js 24 和 npm 11。网页开发不需要 Rust。

```bash
git clone https://github.com/an-an-618/interview-atlas.git
cd interview-atlas
npm ci
npm test
npm run build
npm run dev
```

已有仓库且工作区干净时，运行 `git switch main`、`git pull --ff-only`、`npm ci`。开始新任务前按 `AGENTS.md` 建立自己的 feature/fix 分支。

网页固定使用 `http://127.0.0.1:43118`；变更地址或端口会切换 IndexedDB 来源。浏览器 QA 使用独立的 43119 端口和虚构数据，不访问日常工作区。

在同一局域网的手机体验：

```bash
npm run dev -- --host 0.0.0.0
```

手机打开终端中的 Network 地址。生产环境将 `dist/` 部署到 HTTPS 静态服务器；仓库不要求后端、账号或云数据库。局域网 HTTP 页面可使用知识管理界面，但浏览器的麦克风等能力可能要求 HTTPS。

## 桌面开发

- **Mac**：Apple Silicon、macOS 15+，安装 Xcode Command Line Tools（`xcode-select --install`）和官方 rustup。
- **Windows**：Windows 10/11 x64，安装 Visual Studio Build Tools 的 C++ 桌面开发组件、Windows SDK 和官方 rustup。
- `rust-toolchain.toml` 选择 Rust 1.90；`Cargo.lock` 锁定桌面依赖。

```bash
npm run desktop:dev
npm run desktop:build
```

`desktop:build` 按本机系统选择打包流程；不支持在 Mac 上交叉打包 Windows。Mac 输出位于 `src-tauri/target/release/bundle/macos/`、`dmg/`；Windows 输出在 `nsis/`、`msi/`。GitHub CI 在两个原生系统上分别构建。双路系统录音仅支持 macOS；Windows 保留文本导入等原有能力。

## 可复现验证

```bash
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:ui
```

`test:ui` 覆盖旧标签页迁移、关联双向跳转和持久化、全站主要页面、表单保存失败重试、10 种宽度、44px 触摸热区、键盘焦点、闪卡翻面／滑动／洗牌、固定导航与阅读边界，以及浏览器 75%／100%／125%／150%／175%／200% 实际缩放。脚本自动启动并关闭隔离服务，依赖只来自锁文件；可用 `CHROME_PATH` 指定自有 Chrome。

`npm run test:flows` 验证导入、后台提取、编辑、简历解析、分页分享和模拟面试。Mac 上运行 `npx playwright install webkit`、`npm run test:webkit` 验证 Safari 内核的桌面／平板／手机页面、闪卡翻面和数据持久化。CI 的 Windows 任务还会执行 NSIS 静默安装与应用启动检查。

完整原生检查：

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib share::tests
```

产品行为首先阅读 [独立模块规范](../product/resource-product-logic.md)。UI 修改首先阅读 [全站 UI 规范](ui-design-system.md) 和根目录 `.uicraft.md`，复用 `src/components/UI.tsx` 与 `src/ui-system.css`。`continuous-workspace-2.1.md` 和旧通用工作台检查仅为历史记录；不要重新挂载那些页面。

## 数据与凭据

GitHub 同步源码、锁文件、测试、文档和构建流程。真实面经、简历、音频、IndexedDB 数据及 API 密钥不进入 Git。换电脑前在设置页导出 JSON，在新客户端设置页导入；模型与转写密钥在新会话重新配置。桌面客户端和不同浏览器来源各自持有工作区。

## 下一次发布

更新 `package.json`／锁文件、Tauri 配置及 Cargo 版本，并提供 `docs/releases/v<version>.md`。按照 `AGENTS.md` 通过 PR 与 CI 合并 `main`，再创建对应的 annotated tag 并推送。标签 CI 通过 Mac 和 Windows 的单元、UI 与打包检查后发布 4 个下载文件及 3 个校验文件。安装包不进入 Git 历史。
