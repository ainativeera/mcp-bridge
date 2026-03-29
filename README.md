# MCP Bridge - 开发者指南 (macOS)

这是一个基于 Electron + React + Node.js 构建的 MCP (Model Context Protocol) 协议网关。

## 🚀 快速开始

### 1. 环境准备
确保你的 Mac 已安装：
- **Node.js** (建议 v18 或更高版本)
- **npm** (随 Node.js 一起安装)

### 2. 安装依赖
在项目根目录下运行：
```bash
npm install
```

### 3. 启动开发模式
你需要同时运行两个服务（或者在一个终端运行，应用会自动处理）：

**方式 A：全功能开发模式 (推荐)**
1. 启动后端服务与 Vite 编译：
   ```bash
   npm run dev
   ```
2. 在另一个终端窗口启动 Electron 窗口：
   ```bash
   npm run electron:dev
   ```

**方式 B：仅 Web 预览模式**
如果你只想在浏览器中调试 UI：
```bash
npm run dev
```
然后在浏览器访问 `http://localhost:3000`。

---

## 📦 打包发布 (生成 .dmg)

如果你想生成一个可以发给别人安装的 `.dmg` 文件：

```bash
npm run dist:mac
```
打包完成后，安装包将出现在 `release/` 目录下。

---

## 🛠️ 核心功能说明

- **cURL 导入**：点击左侧"导入 cURL"按钮，粘贴命令即可。
- **SQLite 存储**：所有配置保存在本地 `mcp_bridge.db` 文件中。
- **MCP SSE 协议**：应用运行后，SSE 地址为 `http://localhost:3000/sse`。
- **返回值说明**：在"返回值说明"标签页中，可以为每个返回字段添加描述，帮助 AI 模型理解响应结构。
- **智能识别返回字段**：运行测试成功后，点击"智能识别返回字段"按钮，系统会自动解析返回数据结构并填充字段信息。

## 📂 目录结构
- `electron-main.ts`: Electron 主进程逻辑。
- `server.ts`: Express 后端与 MCP SSE 协议实现。
- `src/App.tsx`: React 前端界面。
- `src/db.ts`: SQLite 数据库服务。
