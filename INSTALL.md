# Inline Math Preview 插件安装指南

> 本指南针对 Vault 路径：`/Users/leaves/BAIDU_SYNC/Obsidian/MATH`

## 1. 编译插件（生成 main.js）

如果你已经拿到源码，需要先安装依赖并编译，生成 Obsidian 可用的 `main.js` 文件。

### 环境要求
- [Node.js](https://nodejs.org/)（建议 v18 或更高版本）
- npm（随 Node.js 一起安装）

### 编译步骤

1. 打开终端，进入本插件的源码目录：
   ```bash
   cd /Users/leaves/wineDir/obs_plugin_dev/richLatex
   ```

2. 安装项目依赖：
   ```bash
   npm install --legacy-peer-deps
   ```

3. 编译生成 `main.js`：
   ```bash
   npm run build
   ```
   编译成功后，你会在目录中看到生成的 `main.js` 文件。

   如果你正在开发或调试，也可以使用开发模式（修改代码后自动重新编译）：
   ```bash
   npm run dev
   ```

## 2. 复制插件文件到 Vault

在你的 Vault 中，进入以下目录（如果没有 `.obsidian/plugins/inline-math-preview` 文件夹，请手动创建）：

```
/Users/leaves/BAIDU_SYNC/Obsidian/MATH/.obsidian/plugins/inline-math-preview/
```

将本插件目录中的以下 **3 个文件** 复制到上述文件夹内：

- `main.js`
- `manifest.json`
- `styles.css`

复制完成后，该文件夹内应包含：

```
inline-math-preview/
├── main.js
├── manifest.json
└── styles.css
```

## 3. 在 Obsidian 中启用插件

1. 打开 Obsidian（确保打开的是 `MATH` 这个 Vault）。
2. 进入 **设置 → 社区插件**。
3. 如果页面顶部提示“安全模式”，请先点击 **关闭安全模式**。
4. 在已安装的插件列表中找到 **Inline Math Preview**。
5. 打开右侧的开关以启用插件。

## 4. 确认编辑器模式

本插件仅在 **Live Preview（实时预览）** 模式下生效。

- 进入 **设置 → 编辑器 → 默认编辑模式**，确认选择的是 **Live Preview**。
- 如果你当前在某个笔记中，也可以点击右上角的书本/铅笔图标，切换到 Live Preview 模式。

## 5. 验证效果

1. 新建或打开任意一个 Markdown 笔记。
2. 输入一段行内公式，例如：
   ```markdown
   测试公式：$x^2 + y^2 = z^2$
   ```
3. 将光标移动进 `$` 符号之间（即在编辑该公式时）。
4. 你会看到公式下方出现一行**渲染后的 MathJax 预览**。
5. 将光标移出 `$` 符号范围，预览会自动消失，恢复 Obsidian 原生的行内公式渲染。

## 6. 卸载或更新插件

### 卸载
- 在 **设置 → 社区插件** 中关闭 **Inline Math Preview** 的开关。
- 然后删除以下文件夹即可：
  ```
  /Users/leaves/BAIDU_SYNC/Obsidian/MATH/.obsidian/plugins/inline-math-preview/
  ```

### 更新
- 如果后续重新编译生成了新的 `main.js`，只需覆盖目标文件夹中的旧 `main.js`。
- 建议在 Obsidian 中先关闭插件，复制文件后再重新开启，或直接重启 Obsidian。
