# macOS 桌面构建与发布

千面使用 Tauri 2 封装现有 React/Vite 应用。桌面壳不复制业务代码，也不新增后端服务。

## 当前支持范围

- macOS 13 及以上；
- Apple Silicon（`arm64` / `aarch64`）；
- `.app` 应用包；
- `.dmg` 拖拽安装镜像；
- 本地 ad-hoc 签名，用于开发和内部预览。

当前构建未经 Apple Developer ID 签名和 Apple notarization，不应作为面向公众的正式版本发布。

## 环境准备

安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

安装 Rust：

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

仓库根目录的 `rust-toolchain.toml` 会选择项目所需版本。然后安装 Node.js 依赖：

```bash
npm ci
```

## 开发与构建

启动桌面开发模式：

```bash
npm run desktop:dev
```

生成 `.app` 和 `.dmg`：

```bash
npm run desktop:build
```

输出位置：

```text
src-tauri/target/release/bundle/macos/千面.app
src-tauri/target/release/bundle/dmg/Interview-Atlas_<version>_<architecture>.dmg
```

构建脚本会在没有 Developer ID 签名时补充 ad-hoc 签名，并创建包含“千面.app”和“Applications”入口的压缩 DMG。

## 安装预览包

1. 打开 DMG。
2. 将“千面.app”拖入“Applications”。
3. 未公证版本首次打开时，在 Finder 中右键应用并选择“打开”，再次确认。

不要关闭系统级 Gatekeeper。正式公开下载应使用签名和公证后的安装包。

## 数据边界

- 桌面应用继续使用 IndexedDB，但其 WebView 工作区与 Chrome、Safari 等浏览器相互独立。
- 浏览器数据不会自动同步到桌面应用；可通过“导出 JSON → 设置页迁移”显式恢复工作区。
- API Key 仍只保存在当前应用会话中，不进入 IndexedDB 或导出文件。
- 恢复前会校验格式版本、字段和对象关系；校验或写入失败时保留当前工作区。

## 正式 GitHub Release

公开发布前需要：

1. 加入 Apple Developer Program；
2. 配置 Developer ID Application 证书；
3. 在受控发布环境中注入签名与 notarization 凭据；
4. 构建、签名、公证并 staple DMG；
5. 用 `codesign`、`spctl` 和 `xcrun stapler` 验证；
6. 生成 SHA-256 校验值；
7. 将 DMG 和校验值上传到 GitHub Release，不把二进制提交到 Git 历史。

Intel 或 Universal Binary、自动更新、签名密钥管理和自动发布工作流需要单独评审。
