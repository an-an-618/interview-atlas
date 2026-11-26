# 全站配色与交互

完整且优先的规范见 [UI 设计规范](ui-design-system.md)。颜色、尺寸、圆角、图标语义、表单、选择态、焦点和响应式均按该规范执行。

- 主操作深绿、选中浅绿，删除与错误保留红色，收藏保留金色。
- 普通按钮 40px、紧凑操作 32px、突出操作 44px；动作圆角 8px，图标线宽 1.75。
- 手机及粗指针控件提升到 44px。列表、开关及导航使用自己的结构。
- 搜索保留单下划线；普通字段只在聚焦时显线，键盘按钮使用 2px 轮廓。相邻列表与详情取消成对外框，列表行和工具区用留白分组。
- 闪卡布局、翻面、滑动与洗牌保留；场景中的操作控件仍遵守公共规则。

入口加载顺序为 `styles.css` → `theme.css` → `workbench.css` → `ui-system.css`。最后一层提供公共控件契约，禁止页面样式另设控件外观。新控件使用 `Button`、`IconButton`、`UIIcon`。

```bash
npm run build
npm test
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/check-ui-system.mjs
```

产品逻辑沿用 2.0 独立资源模块，当前信笺界面仅承载已有能力。见 [产品逻辑](../product/resource-product-logic.md)。脚本使用独立浏览器与示例数据，支持 `APP_URL`、`PLAYWRIGHT_MODULE`、`CHROME_PATH`、`SCREENSHOT_DIR`，覆盖六个一级入口、详情、桌面/手机以及原生 Chrome 缩放。
