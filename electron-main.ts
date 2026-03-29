import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import util from 'util';
import type { MCPTool } from './src/types';

let toolService: typeof import('./src/db').toolService;
const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
const defaultServerPort = Number(process.env.PORT || 3000);

function getLocalIpAddress() {
  const networks = os.networkInterfaces();

  for (const network of Object.values(networks)) {
    for (const item of network || []) {
      if (item.family === 'IPv4' && !item.internal) {
        return item.address;
      }
    }
  }

  return '127.0.0.1';
}

function getMcpUrl() {
  const host = getLocalIpAddress();
  return `http://${host}:${defaultServerPort}/sse`;
}

function writeLog(message: string, payload?: unknown) {
  const detail = payload ? ` ${util.inspect(payload, { depth: 4 })}` : '';
  const line = `[${new Date().toISOString()}] ${message}${detail}`;

  console.log(line);

  try {
    const logDir = app.isReady() ? app.getPath('userData') : process.cwd();
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'mcp-bridge-startup.log'), `${line}\n`);
  } catch (error) {
    console.error('Failed to write startup log', error);
  }
}

async function getToolService() {
  if (toolService) {
    return toolService;
  }

  process.env.APP_DATA_DIR = app.getPath('userData');
  process.env.DB_SEED_PATH = path.join(app.getAppPath(), 'mcp_bridge.db');
  writeLog('Initializing tool service', {
    appPath: app.getAppPath(),
    userData: app.getPath('userData'),
  });

  ({ toolService } = await import('./src/db'));
  writeLog('Tool service initialized');

  return toolService;
}

function showStartupError(message: string) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const html = `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <title>MCP Bridge 启动失败</title>
        <style>
          body {
            margin: 0;
            background: #09090b;
            color: #f4f4f5;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
            display: flex;
            min-height: 100vh;
            align-items: center;
            justify-content: center;
          }
          .card {
            max-width: 640px;
            padding: 32px;
            border-radius: 20px;
            background: #18181b;
            border: 1px solid #27272a;
            box-shadow: 0 20px 60px rgba(0,0,0,0.35);
          }
          h1 { margin: 0 0 12px; font-size: 24px; }
          p { margin: 0 0 12px; color: #a1a1aa; line-height: 1.6; }
          code {
            display: block;
            margin-top: 16px;
            padding: 12px;
            border-radius: 12px;
            background: #09090b;
            color: #c4b5fd;
            white-space: pre-wrap;
            word-break: break-word;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>MCP Bridge 启动失败</h1>
          <p>应用窗口已创建，但页面或服务初始化没有成功完成。</p>
          <p>请把下面这段错误信息发给开发者。</p>
          <code>${message.replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char]!))}</code>
        </div>
      </body>
    </html>
  `;

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  mainWindow.show();
  mainWindow.focus();
}

function getPreloadPath() {
  return isDev
    ? path.join(app.getAppPath(), 'dist-electron', 'src', 'preload.js')
    : path.join(__dirname, 'src', 'preload.js');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    show: true,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 18, y: 18 } : undefined,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    writeLog('Window ready-to-show');
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('closed', () => {
    writeLog('Window closed');
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    writeLog('Renderer finished load');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    const details = { errorCode, errorDescription, validatedURL };
    writeLog('Renderer failed to load', details);
    showStartupError(`页面加载失败: ${errorDescription} (${errorCode})\nURL: ${validatedURL}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeLog('Renderer process gone', details);
    showStartupError(`渲染进程退出: ${JSON.stringify(details)}`);
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000').catch(error => {
      writeLog('Failed to load dev URL', error);
      showStartupError(`开发环境页面加载失败: ${String(error)}`);
    });
    return;
  }

  const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
  writeLog('Loading renderer entry', { indexPath, preloadPath: getPreloadPath() });

  mainWindow.loadFile(indexPath).catch(error => {
    writeLog('loadFile failed', error);
    showStartupError(`页面入口加载失败: ${String(error)}`);
  });
}

function registerIpcHandlers() {
  ipcMain.handle('get-app-info', async () => {
    return {
      isDesktop: true,
      platform: process.platform,
      isPackaged: app.isPackaged,
      localIp: getLocalIpAddress(),
      mcpUrl: getMcpUrl(),
      serverPort: defaultServerPort,
    };
  });

  ipcMain.handle('get-tools', async () => {
    return (await getToolService()).getAll();
  });

  ipcMain.handle('save-tool', async (_, tool: MCPTool) => {
    return (await getToolService()).save(tool);
  });

  ipcMain.handle('delete-tool', async (_, id: string) => {
    return (await getToolService()).delete(id);
  });

  ipcMain.handle('get-logs', async (_, toolId: string) => {
    return (await getToolService()).getLogs(toolId);
  });

  ipcMain.handle('get-settings', async () => {
    return (await getToolService()).getSettings();
  });

  ipcMain.handle('update-setting', async (_, { key, value }) => {
    return (await getToolService()).updateSetting(key, value);
  });

  ipcMain.handle('get-server-status', async () => {
    const service = await getToolService();
    return {
      activeConnections: 0,
      uptime: process.uptime(),
      toolsCount: service.getAll().length,
      serverPort: defaultServerPort,
      host: getLocalIpAddress(),
    };
  });

  ipcMain.handle('execute-proxy', async (_, { tool, values }) => {
    let finalUrl = tool.url;
    let finalBody = tool.body;

    Object.entries(values).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      finalUrl = finalUrl.replace(new RegExp(placeholder, 'g'), String(value));
      if (typeof finalBody === 'string') {
        finalBody = finalBody.replace(new RegExp(placeholder, 'g'), String(value));
      }
    });

    const headers: Record<string, string> = {};
    tool.headers.forEach((h: any) => {
      if (h.key && h.value) headers[h.key] = h.value;
    });

    try {
      const response = await fetch(finalUrl, {
        method: tool.method,
        headers,
        body: tool.method !== 'GET' ? finalBody : undefined
      });

      const data = await response.json();

      let filteredData = data;
      if (tool.responseFilter) {
        const parts = tool.responseFilter.split('.');
        parts.forEach(part => {
          if (filteredData && filteredData[part] !== undefined) {
            filteredData = filteredData[part];
          }
        });
      }

      return {
        request: { url: finalUrl, method: tool.method, headers, body: finalBody },
        response: { status: response.status, data, filteredData }
      };
    } catch (error: any) {
      return { error: error.message };
    }
  });
}

app.whenReady().then(async () => {
  try {
    registerIpcHandlers();
    createWindow();
    getToolService().catch(error => {
      writeLog('Background tool service init failed', error);
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (error) {
    writeLog('App startup failed', error);
    showStartupError(`主进程启动失败: ${String(error)}`);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
