# Windows 桌面构建与发布

千面复用现有 Tauri 2 桌面壳和 React/Vite 应用，不维护单独的 Windows 业务代码。

## 当前支持范围

- x64 Windows 10/11；
- NSIS `.exe` 安装器，默认仅为当前用户安装；
- MSI 安装包；
- GitHub Actions 原生 Windows 构建与产物校验。

当前预览包未经 Authenticode 签名。Windows 可能显示 Microsoft Defender SmartScreen 警告，不应将未签名包视为正式公开版本。

安装包与开始菜单使用 ASCII 名称 `Interview Atlas`，避免 WiX 3 处理中文输出路径时构建失败；应用窗口标题仍显示“千面”。

## 本机构建

需要 Node.js 24、npm 11、Rust 1.90，以及包含 MSVC C++ 构建工具的 Visual Studio Build Tools。先安装依赖：

```powershell
npm ci
```

启动桌面开发模式：

```powershell
npm run desktop:dev
```

生成 NSIS 和 MSI 安装器：

```powershell
npm run desktop:build:windows
```

输出位置：

```text
src-tauri\target\release\bundle\nsis\*-setup.exe
src-tauri\target\release\bundle\msi\*.msi
```

## GitHub Actions 构建

推送分支、创建 Pull Request，或在 Actions 页面手动运行 `CI` 工作流。完成后，在该次运行的 Artifacts 区域下载 `interview-atlas-windows-x64`，其中包含 `.exe` 和 `.msi`。

Actions 产物保留 7 天。正式版本应将签名后的安装包和 SHA-256 校验值上传到 GitHub Release。

## 安装与数据边界

- 普通用户优先使用 `*-setup.exe`；MSI 更适合管理员或企业部署。
- Windows 缺少 WebView2 时，安装器会联网下载运行时引导程序。
- Windows 桌面版拥有独立的 IndexedDB 工作区，不会自动同步浏览器或 macOS 数据。
- 可使用“导出 JSON → 设置页迁移”在不同客户端间恢复工作区。
- API Key 仍只保存在当前应用会话中。

## 正式发布

公开发布前需要：

1. 获取受信任的 Windows 代码签名证书；
2. 在受控发布环境中配置签名和时间戳服务；
3. 对主程序、NSIS 安装器和 MSI 进行 Authenticode 签名；
4. 在干净的 Windows 10/11 环境执行安装、启动、卸载和数据持久化测试；
5. 生成 SHA-256 校验值并上传 GitHub Release。
