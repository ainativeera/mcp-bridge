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

function getValueByPath(source: any, path?: string) {
  if (!path || path === '$' || path === '$.') {
    return source;
  }

  const pathParts = path
    .replace(/^\$\./, '')
    .replace(/^\$/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map(part => part.trim())
    .filter(Boolean);

  let currentValue = source;

  for (const part of pathParts) {
    if (currentValue === null || currentValue === undefined) {
      return undefined;
    }

    const isIndex = /^\d+$/.test(part);
    const nextValue = isIndex && Array.isArray(currentValue)
      ? currentValue[Number(part)]
      : currentValue[part];

    if (nextValue === undefined) {
      return undefined;
    }

    currentValue = nextValue;
  }

  return currentValue;
}

function normalizePathParts(path?: string) {
  if (!path || path === '$' || path === '$.') {
    return [];
  }

  return path
    .replace(/^\$\./, '')
    .replace(/^\$/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map(part => part.trim())
    .filter(Boolean);
}

function getRelativePath(parentPath: string | undefined, childPath: string | undefined) {
  const childParts = normalizePathParts(childPath);
  const parentParts = normalizePathParts(parentPath);

  if (parentParts.length === 0) {
    return childPath;
  }

  const matchesPrefix = parentParts.every((part, index) => childParts[index] === part);
  if (!matchesPrefix) {
    return childPath;
  }

  const relativeParts = childParts.slice(parentParts.length);
  if (relativeParts.length === 0) {
    return '$';
  }

  return relativeParts.join('.');
}

function isFieldIncluded(field: any) {
  return field?.includeInResponse !== false;
}

function buildStructuredContent(tool: any, responseData: any, filteredData: any) {
  if (!Array.isArray(tool.responseFields) || tool.responseFields.length === 0) {
    return filteredData;
  }

  const extractFieldValue = (field: any, scopedSource: any, fallbackSource: any, parentPath?: string): any => {
    const localPath = getRelativePath(parentPath, field.path);
    const localValue = getValueByPath(scopedSource, localPath);
    const fallbackValue = localValue !== undefined ? localValue : getValueByPath(fallbackSource, field.path);
    const resolvedValue = localValue !== undefined ? localValue : fallbackValue;

    if (field.type === 'object') {
      const objectValue = resolvedValue && typeof resolvedValue === 'object' && !Array.isArray(resolvedValue)
        ? resolvedValue
        : {};
      const nextObject: Record<string, any> = {};

      (field.children || []).forEach((child: any) => {
        if (!child?.name || child.name === 'item' || !isFieldIncluded(child)) {
          return;
        }

        const childValue = extractFieldValue(child, objectValue, fallbackValue, field.path);
        if (childValue !== undefined) {
          nextObject[child.name] = childValue;
        }
      });

      return nextObject;
    }

    if (field.type === 'array') {
      const arrayValue = Array.isArray(resolvedValue) ? resolvedValue : [];
      const itemField = (field.children || []).find((child: any) => child?.name === 'item');

      if (!itemField || !isFieldIncluded(itemField)) {
        return arrayValue;
      }

      return arrayValue.map((item: any) => extractFieldValue(itemField, item, item, field.path));
    }

    return resolvedValue;
  };

  const rootField = tool.responseFields[0];
  const isTree = Array.isArray(rootField?.children) || rootField?.name === 'root';

  if (isTree) {
    const rootPath = rootField?.path || '$';
    const rootScopedValue = getValueByPath(filteredData, rootPath);
    const rootValue = rootScopedValue !== undefined
      ? rootScopedValue
      : getValueByPath(responseData, rootPath);

    if (rootField?.name === 'root') {
      if (rootField.type === 'array') {
        const itemField = (rootField.children || []).find((child: any) => child?.name === 'item');
        const arrayValue = Array.isArray(rootValue) ? rootValue : [];

        if (!itemField || !isFieldIncluded(itemField)) {
          return arrayValue;
        }

        return arrayValue.map((item: any) => extractFieldValue(itemField, item, item, rootField.path));
      }

      if (rootField.type === 'object') {
        const objectValue = rootValue && typeof rootValue === 'object' && !Array.isArray(rootValue) ? rootValue : {};
        const nextObject: Record<string, any> = {};

        (rootField.children || []).forEach((child: any) => {
          if (!child?.name || child.name === 'item' || !isFieldIncluded(child)) {
            return;
          }

          const childValue = extractFieldValue(child, objectValue, rootValue, rootField.path);
          if (childValue !== undefined) {
            nextObject[child.name] = childValue;
          }
        });

        return nextObject;
      }

      return rootValue;
    }

    if (!isFieldIncluded(rootField)) {
      return undefined;
    }

    return { [rootField.name]: extractFieldValue(rootField, filteredData, responseData, '$') };
  }

  const structuredContent: Record<string, any> = {};

  tool.responseFields.forEach((field: any) => {
    if (!field?.name || !isFieldIncluded(field)) {
      return;
    }

    const valueFromFiltered = getValueByPath(filteredData, field.path);
    const value = valueFromFiltered !== undefined
      ? valueFromFiltered
      : getValueByPath(responseData, field.path);

    structuredContent[field.name] = value;
  });

  return structuredContent;
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
    try {
      const response = await fetch(`http://127.0.0.1:${defaultServerPort}/api/status`);
      if (response.ok) {
        const data = await response.json();
        return {
          ...data,
          serverPort: defaultServerPort,
          host: getLocalIpAddress(),
        };
      }
    } catch {
    }

    return {
      activeConnections: 0,
      uptime: process.uptime(),
      toolsCount: service.getAll().length,
      toolsVersion: 0,
      sessions: [],
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
        const extractedData = getValueByPath(filteredData, tool.responseFilter);
        if (extractedData !== undefined) {
          filteredData = extractedData;
        }
      }

      const structuredData = buildStructuredContent(tool, data, filteredData);
      const returnValue = structuredData !== undefined ? structuredData : filteredData;

      return {
        request: { url: finalUrl, method: tool.method, headers, body: finalBody },
        response: { status: response.status, data, filteredData, structuredData, returnValue }
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
