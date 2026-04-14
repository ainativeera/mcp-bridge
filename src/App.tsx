/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, Component } from 'react';
import { 
  Plus, 
  Search, 
  Settings, 
  Sun,
  Moon,
  Terminal, 
  Play, 
  Save, 
  Trash2, 
  FileJson, 
  Link2, 
  Zap, 
  ChevronRight,
  ChevronDown,
  Code,
  Sparkles,
  RefreshCw,
  Globe,
  ShieldCheck,
  Cpu,
  Folder,
  FolderPlus,
  MoreVertical,
  Edit2,
  History,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { buildMcpToolDefinition, getResponseFieldSummary } from './lib/mcp-description';
import { MCPTool, MCPParameter, MCPResponseField } from './types';

// --- Types & Interfaces ---
declare global {
  interface Window {
    electron?: {
      getAppInfo: () => Promise<{
        isDesktop: boolean;
        platform: string;
        isPackaged: boolean;
        localIp: string;
        mcpUrl: string;
        serverPort: number;
      }>;
      getTools: () => Promise<MCPTool[]>;
      saveTool: (tool: MCPTool) => Promise<any>;
      deleteTool: (id: string) => Promise<any>;
      getLogs: (toolId: string) => Promise<any[]>;
      getSettings: () => Promise<any>;
      updateSetting: (key: string, value: any) => Promise<any>;
      getServerStatus: () => Promise<any>;
      executeProxy: (data: { tool: MCPTool; values: any }) => Promise<any>;
    };
  }
}

// --- Service Layer (Dual Mode) ---
const api = {
  getTools: async () => {
    if (window.electron) return window.electron.getTools();
    const res = await fetch('/api/tools');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
  },
  saveTool: async (tool: MCPTool) => {
    if (window.electron) return window.electron.saveTool(tool);
    const res = await fetch('/api/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tool)
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
  },
  deleteTool: async (id: string) => {
    if (window.electron) return window.electron.deleteTool(id);
    const res = await fetch(`/api/tools/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
  },
  executeProxy: async (tool: MCPTool, values: any) => {
    if (window.electron) return window.electron.executeProxy({ tool, values });
    const res = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, values })
    });
    if (!res.ok) {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(text || `HTTP error! status: ${res.status}`);
      }
    }
    return res.json();
  },
  getLogs: async (toolId: string) => {
    if (window.electron) return window.electron.getLogs(toolId);
    const res = await fetch(`/api/logs/${toolId}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
  },
  getSettings: async () => {
    if (window.electron) return window.electron.getSettings();
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
  },
  updateSetting: async (key: string, value: any) => {
    if (window.electron) return window.electron.updateSetting(key, value);
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
  }
};

// --- Components ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 text-center">
          <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center border border-rose-500/20 mb-6">
            <XCircle className="w-8 h-8 text-rose-500" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">应用运行出错</h1>
          <p className="text-zinc-400 mb-8 max-w-md">
            抱歉，应用程序遇到了一个意外错误。请尝试刷新页面。
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-medium transition-all"
          >
            刷新页面
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

const Badge = ({ children, className, variant = 'default' }: any) => {
  const variants = {
    default: 'bg-zinc-800 text-zinc-400',
    success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider", variants[variant as keyof typeof variants], className)}>
      {children}
    </span>
  );
};

const MethodBadge = ({ method }: { method: string }) => {
  const colors: any = {
    GET: 'text-emerald-400',
    POST: 'text-amber-400',
    PUT: 'text-blue-400',
    DELETE: 'text-rose-400',
    PATCH: 'text-purple-400',
  };
  return <span className={cn("font-mono font-bold text-[10px] w-10 inline-block", colors[method] || 'text-zinc-400')}>{method}</span>;
};

function createFieldId() {
  return Math.random().toString(36).slice(2, 10);
}

function createResponseField(overrides: Partial<MCPResponseField> = {}): MCPResponseField {
  return {
    id: createFieldId(),
    name: '',
    path: '',
    type: 'string',
    description: '',
    required: false,
    includeInResponse: true,
    example: '',
    children: [],
    ...overrides
  };
}

function inferResponseFieldType(value: any): MCPResponseField['type'] {
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value && typeof value === 'object') return 'object';
  return 'string';
}

function formatExample(value: any) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value.length > 50 ? `${value.substring(0, 50)}...` : value;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value).slice(0, 80);
    } catch {
      return '';
    }
  }
  return String(value);
}

function normalizePath(path?: string) {
  if (!path || path === '$' || path === '$.') return '$';
  return path
    .replace(/^\$\./, '')
    .replace(/^\$/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map(part => part.trim())
    .filter(Boolean);
}

function buildPath(parentPath: string, fieldName: string, parentType?: MCPResponseField['type']) {
  if (parentType === 'array') {
    return `${parentPath}[0]${fieldName ? `.${fieldName}` : ''}`;
  }
  if (parentPath === '$') {
    return fieldName || '$';
  }
  return fieldName ? `${parentPath}.${fieldName}` : parentPath;
}

function parseResponseToFieldTree(data: any, name = 'root', path = '$'): MCPResponseField {
  const type = inferResponseFieldType(data);

  if (type === 'array') {
    const firstItem = Array.isArray(data) && data.length > 0 ? data[0] : null;
    const itemNode = createResponseField({
      name: 'item',
      path: `${path}[0]`,
      type: inferResponseFieldType(firstItem),
      description: '',
      example: formatExample(firstItem)
    });

    if (firstItem && typeof firstItem === 'object') {
      itemNode.children = Array.isArray(firstItem)
        ? [parseResponseToFieldTree(firstItem[0], 'item', `${path}[0][0]`)]
        : Object.entries(firstItem).map(([key, value]) => parseResponseToFieldTree(value, key, `${path}[0].${key}`));
    }

    return createResponseField({
      name,
      path,
      type: 'array',
      description: '',
      example: formatExample(Array.isArray(data) ? data.slice(0, 2) : data),
      children: [itemNode]
    });
  }

  if (type === 'object') {
    return createResponseField({
      name,
      path,
      type: 'object',
      description: '',
      example: '',
      children: Object.entries(data || {}).map(([key, value]) => parseResponseToFieldTree(value, key, path === '$' ? key : `${path}.${key}`))
    });
  }

  return createResponseField({
    name,
    path,
    type,
    description: '',
    example: formatExample(data),
    children: []
  });
}

function walkResponseFields(fields: MCPResponseField[], visit: (field: MCPResponseField, parent?: MCPResponseField) => void, parent?: MCPResponseField) {
  fields.forEach((field) => {
    visit(field, parent);
    if (field.children?.length) {
      walkResponseFields(field.children, visit, field);
    }
  });
}

function ensureResponseFieldIds(fields: MCPResponseField[]): MCPResponseField[] {
  return fields.map((field) => ({
    ...field,
    id: field.id || createFieldId(),
    required: field.required ?? false,
    includeInResponse: field.includeInResponse ?? true,
    children: ensureResponseFieldIds(field.children || [])
  }));
}

function legacyFieldsToTree(fields: MCPResponseField[]): MCPResponseField[] {
  const root = createResponseField({
    name: 'root',
    path: '$',
    type: 'object',
    children: []
  });

  const getOrCreateChild = (parent: MCPResponseField, childName: string, childPath: string, childType: MCPResponseField['type']) => {
    const existing = (parent.children || []).find((child) => child.name === childName && child.path === childPath);
    if (existing) {
      if (existing.type !== 'array' && childType === 'array') {
        existing.type = childType;
      }
      return existing;
    }
    const child = createResponseField({
      name: childName,
      path: childPath,
      type: childType,
      children: childType === 'object' || childType === 'array' ? [] : []
    });
    parent.children = [...(parent.children || []), child];
    return child;
  };

  fields.forEach((field) => {
    const segments = normalizePath(field.path || field.name);
    if (segments === '$') {
      return;
    }

    const parts = Array.isArray(segments) ? segments : [];
    let current = root;
    let currentPath = '$';

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const isIndex = /^\d+$/.test(part);

      if (isIndex) {
        current.type = 'array';
        const itemPath = `${currentPath}[0]`;
        current = getOrCreateChild(current, 'item', itemPath, isLast ? field.type : 'object');
        currentPath = itemPath;
        return;
      }

      const nextPart = parts[index + 1];
      const nextType: MCPResponseField['type'] = isLast
        ? field.type
        : /^\d+$/.test(nextPart || '') ? 'array' : 'object';
      const nextPath = currentPath === '$' ? part : `${currentPath}.${part}`;
      current = getOrCreateChild(current, part, nextPath, nextType);
      currentPath = nextPath;

      if (isLast) {
        current.description = field.description;
        current.example = field.example;
        current.required = field.required ?? false;
      }
    });
  });

  return [root];
}

function normalizeResponseFields(fields: MCPResponseField[]) {
  const withIds = ensureResponseFieldIds(fields || []);
  const hasTreeShape = withIds.some((field) => (field.children?.length || field.name === 'root'));
  return hasTreeShape ? withIds : legacyFieldsToTree(withIds);
}

function updateResponseFieldTree(fields: MCPResponseField[], fieldId: string, updater: (field: MCPResponseField) => MCPResponseField): MCPResponseField[] {
  return fields.map((field) => {
    if (field.id === fieldId) {
      return updater(field);
    }
    if (field.children?.length) {
      return {
        ...field,
        children: updateResponseFieldTree(field.children, fieldId, updater)
      };
    }
    return field;
  });
}

function removeResponseFieldTree(fields: MCPResponseField[], fieldId: string): MCPResponseField[] {
  return fields
    .filter((field) => field.id !== fieldId)
    .map((field) => ({
      ...field,
      children: removeResponseFieldTree(field.children || [], fieldId)
    }));
}

function rebuildResponseFieldPaths(field: MCPResponseField, parentPath = '$', parentType?: MCPResponseField['type']): MCPResponseField {
  const isRoot = field.name === 'root' && parentPath === '$';
  const nextPath = isRoot ? '$' : buildPath(parentPath, field.name, parentType);
  const nextType = field.type;

  return {
    ...field,
    path: nextPath,
    children: (field.children || []).map((child) => rebuildResponseFieldPaths(child, nextPath, nextType))
  };
}

interface ResponseFieldTreeEditorProps {
  fields: MCPResponseField[];
  expandedMap: Record<string, boolean>;
  onToggle: (fieldId: string) => void;
  onUpdate: (fieldId: string, updates: Partial<MCPResponseField>) => void;
  onAddChild: (parentId?: string) => void;
  onDelete: (fieldId: string) => void;
}

function ResponseFieldTreeEditor({
  fields,
  expandedMap,
  onToggle,
  onUpdate,
  onAddChild,
  onDelete
}: ResponseFieldTreeEditorProps) {
  const renderNode = (field: MCPResponseField, depth = 0, parent?: MCPResponseField) => {
    const canExpand = !!field.children?.length;
    const isExpanded = field.id ? expandedMap[field.id] !== false : true;
    const isRoot = field.name === 'root' && depth === 0;
    const canHaveChildren = field.type === 'object' || field.type === 'array';
    const isArrayItemNode = parent?.type === 'array' && field.name === 'item';
    const isReadonlyName = isRoot || isArrayItemNode;
    const canToggleInclude = !isRoot;

    return (
      <div key={field.id || field.path} className="space-y-1.5">
        <div
          className="grid grid-cols-[minmax(0,2.1fr)_88px_88px_0.9fr_1.1fr_64px] items-center gap-2 rounded-lg bg-transparent px-1 py-0.5"
          style={{ marginLeft: depth * 12 }}
        >
          <div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => canExpand && field.id && onToggle(field.id)}
                className={cn(
                  "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-zinc-600",
                  canExpand ? "hover:bg-zinc-900 hover:text-zinc-300" : "opacity-30"
                )}
              >
                {canExpand ? (isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : <div className="h-3 w-3" />}
              </button>
              <input
                type="text"
                value={isRoot ? 'root' : field.name}
                onChange={(e) => !isReadonlyName && field.id && onUpdate(field.id, { name: e.target.value })}
                disabled={isReadonlyName}
                placeholder={parent?.type === 'array' ? 'item' : '字段名'}
                className={cn(
                  "w-full rounded-md border border-zinc-800/70 bg-zinc-900/70 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-purple-500",
                  isReadonlyName ? "cursor-not-allowed text-zinc-500" : "text-zinc-100"
                )}
              />
            </div>
          </div>

          <div>
            <select
              value={field.type}
              onChange={(e) => field.id && onUpdate(field.id, { type: e.target.value as MCPResponseField['type'] })}
              className="w-full rounded-md border border-zinc-800/70 bg-zinc-900/70 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="object">object</option>
              <option value="array">array</option>
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={field.includeInResponse !== false}
                onChange={(e) => field.id && onUpdate(field.id, { includeInResponse: e.target.checked })}
                disabled={!canToggleInclude}
                className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 text-purple-500 focus:ring-purple-500 disabled:opacity-40"
              />
              <span>{canToggleInclude ? '返回' : '根节点'}</span>
            </label>
          </div>

          <input
            type="text"
            value={field.example || ''}
            onChange={(e) => field.id && onUpdate(field.id, { example: e.target.value })}
            placeholder="mock / 示例值"
            className="w-full rounded-md border border-zinc-800/70 bg-zinc-900/70 px-2 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-purple-500"
          />

          <input
            type="text"
            value={field.description}
            onChange={(e) => field.id && onUpdate(field.id, { description: e.target.value })}
            placeholder="字段说明"
            className="w-full rounded-md border border-zinc-800/70 bg-zinc-900/70 px-2 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-purple-500"
          />

          <div className="flex items-center justify-end gap-1">
            {canHaveChildren && field.id && (
              <button
                type="button"
                onClick={() => onAddChild(field.id)}
                className="rounded-md p-1 text-emerald-400 transition-colors hover:bg-emerald-500/10"
                title="添加子字段"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
            {!isRoot && field.id && (
              <button
                type="button"
                onClick={() => onDelete(field.id)}
                className="rounded-md p-1 text-rose-400 transition-colors hover:bg-rose-500/10"
                title="删除字段"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {canExpand && isExpanded && (
          <div className="space-y-1 border-l border-zinc-800/50 ml-1.5">
            {field.children!.map((child) => renderNode(child, depth + 1, field))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,2.1fr)_88px_88px_0.9fr_1.1fr_64px] gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        <div>字段名</div>
        <div>类型</div>
        <div>返回给调用端</div>
        <div>示例</div>
        <div>说明</div>
        <div className="text-right">操作</div>
      </div>
      <div className="space-y-1.5">
        {fields.map((field) => renderNode(field))}
      </div>
    </div>
  );
}

// --- Main App ---

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  type McpSessionStatus = {
    sessionId: string;
    createdAt: number;
    lastActivityAt: number;
    lastMethod: string;
    messageCount: number;
    initialized: boolean;
    userAgent?: string;
    remoteAddress?: string;
    lastError?: string;
  };

  const [appInfo, setAppInfo] = useState<{
    isDesktop: boolean;
    platform: string;
    isPackaged: boolean;
    localIp: string;
    mcpUrl: string;
    serverPort: number;
  } | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const stored = localStorage.getItem('theme-preference');
      return stored === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [savedTools, setSavedTools] = useState<MCPTool[]>([]);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [activeTab, setActiveTab] = useState<'params' | 'query' | 'headers' | 'body' | 'output' | 'logs'>('params');
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [testValues, setTestValues] = useState<Record<string, any>>({});
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [curlInput, setCurlInput] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ '默认': true });
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [serverStatus, setServerStatus] = useState<{
    activeConnections: number;
    uptime: number;
    toolsCount: number;
    toolsVersion?: number;
    sessions?: McpSessionStatus[];
    serverPort?: number;
    host?: string;
  }>({ activeConnections: 0, uptime: 0, toolsCount: 0, sessions: [] });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<{ globalHeaders: { key: string; value: string }[]; proxyUrl: string; apiKey: string }>({
    globalHeaders: [],
    proxyUrl: '',
    apiKey: ''
  });
  const [expandedResponseFields, setExpandedResponseFields] = useState<Record<string, boolean>>({});

  const [copySuccess, setCopySuccess] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const mcpUrl = useMemo(() => {
    if (appInfo?.mcpUrl) return appInfo.mcpUrl;
    if (window.location.protocol === 'file:') return 'http://127.0.0.1:3000/sse';
    return `${window.location.origin}/sse`;
  }, [appInfo]);

  const isMacDesktop = appInfo?.isDesktop && appInfo.platform === 'darwin';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme-preference', theme);
    } catch {
    }
  }, [theme]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const copyMcpConfig = () => {
    const config: any = {
      mcpServers: {
        "mcp-bridge": {
          url: mcpUrl
        }
      }
    };
    if (globalSettings.apiKey && typeof globalSettings.apiKey === 'string') {
      config.mcpServers["mcp-bridge"].headers = {
        "X-API-Key": globalSettings.apiKey
      };
    }
    copyToClipboard(JSON.stringify(config, null, 2));
  };

  // Fetch tools and settings on mount
  useEffect(() => {
    if (window.electron?.getAppInfo) {
      window.electron.getAppInfo()
        .then(setAppInfo)
        .catch(err => console.error('Failed to fetch app info', err));
    }
    fetchTools();
    fetchSettings();
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      if (window.electron?.getServerStatus) {
        const data = await window.electron.getServerStatus();
        setServerStatus(data);
        return;
      }
      const res = await fetch('/api/status');
      if (!res.ok) return;
      const data = await res.json();
      setServerStatus(data);
    } catch (err) {
      console.error('Failed to fetch status', err);
    }
  };

  const fetchTools = async () => {
    try {
      const normalizedTools = (await api.getTools()).map((tool: MCPTool) => ({
        ...tool,
        responseFields: normalizeResponseFields(tool.responseFields || [])
      }));
      setTools(normalizedTools);
      setSavedTools(normalizedTools);
      if (normalizedTools.length > 0 && !activeToolId) {
        setActiveToolId(normalizedTools[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch tools', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await api.getSettings();
      setGlobalSettings(data);
      if (data.customFolders) {
        setCustomFolders(data.customFolders);
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
    }
  };

  const handleUpdateSetting = async (key: string, value: any) => {
    try {
      setGlobalSettings(prev => ({ ...prev, [key]: value }));
      await api.updateSetting(key, value);
    } catch (err) {
      console.error('Failed to update setting', err);
    }
  };

  const activeTool = useMemo(() => tools.find(t => t.id === activeToolId) || null, [tools, activeToolId]);
  const savedActiveTool = useMemo(() => savedTools.find(t => t.id === activeToolId) || null, [savedTools, activeToolId]);
  const mcpToolPreview = useMemo(() => {
    if (!savedActiveTool) return null;
    return buildMcpToolDefinition(savedActiveTool);
  }, [savedActiveTool]);

  useEffect(() => {
    if (!activeTool?.responseFields?.length) return;

    const nextExpanded: Record<string, boolean> = {};
    walkResponseFields(activeTool.responseFields, (field) => {
      if (field.id && field.children?.length) {
        nextExpanded[field.id] = true;
      }
    });
    setExpandedResponseFields(nextExpanded);
  }, [activeToolId]);

  const handleCreateTool = () => {
    const newTool: MCPTool = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'new_tool',
      description: 'Describe what this tool does for the AI...',
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: '{}',
      responseFilter: '',
      parameters: [],
      responseFields: [createResponseField({ name: 'root', path: '$', type: 'object', children: [] })],
      createdAt: Date.now()
    };
    setTools([newTool, ...tools]);
    setSavedTools(prev => prev.filter(t => t.id !== newTool.id));
    setActiveToolId(newTool.id);
  };

  const handleUpdateTool = (updates: Partial<MCPTool>) => {
    if (!activeToolId) return;
    setTools(tools.map(t => t.id === activeToolId ? {
      ...t,
      ...updates,
      responseFields: updates.responseFields ? normalizeResponseFields(updates.responseFields) : t.responseFields
    } : t));
  };

  const updateResponseField = (fieldId: string, updates: Partial<MCPResponseField>) => {
    if (!activeTool) return;

    const nextFields = updateResponseFieldTree(activeTool.responseFields, fieldId, (field) => {
      const nextField = { ...field, ...updates };
      if (nextField.type !== 'object' && nextField.type !== 'array') {
        nextField.children = [];
      } else {
        nextField.children = nextField.children || [];
      }
      return nextField;
    }).map((field) => rebuildResponseFieldPaths(field));

    handleUpdateTool({ responseFields: nextFields });
  };

  const addResponseChildField = (parentId?: string) => {
    if (!activeTool) return;

    const nextFields = (parentId
      ? updateResponseFieldTree(activeTool.responseFields, parentId, (field) => {
          const childType: MCPResponseField['type'] = field.type === 'array' ? 'object' : 'string';
          const child = createResponseField({
            name: field.type === 'array' ? 'item' : '',
            path: '',
            type: childType,
            children: childType === 'object' ? [] : []
          });
          return {
            ...field,
            children: [...(field.children || []), child]
          };
        })
      : activeTool.responseFields.length > 0
        ? updateResponseFieldTree(activeTool.responseFields, activeTool.responseFields[0].id!, (field) => ({
            ...field,
            children: [...(field.children || []), createResponseField({
              name: '',
              path: '',
              type: 'string'
            })]
          }))
        : [createResponseField({ name: 'root', path: '$', type: 'object', children: [] })])
      .map((field) => rebuildResponseFieldPaths(field));

    handleUpdateTool({ responseFields: nextFields });

    const expandId = parentId || nextFields[0]?.id;
    if (expandId) {
      setExpandedResponseFields(prev => ({ ...prev, [expandId]: true }));
    }
  };

  const deleteResponseField = (fieldId: string) => {
    if (!activeTool) return;
    const nextFields = removeResponseFieldTree(activeTool.responseFields, fieldId);
    handleUpdateTool({ responseFields: (nextFields.length ? nextFields : [createResponseField({ name: 'root', path: '$', type: 'object', children: [] })]).map((field) => rebuildResponseFieldPaths(field)) });
  };

  const saveTool = async () => {
    if (!activeTool) return;
    setIsSaving(true);
    try {
      await api.saveTool(activeTool);
      setSavedTools(prev => prev.some(t => t.id === activeTool.id)
        ? prev.map(t => t.id === activeTool.id ? activeTool : t)
        : [activeTool, ...prev]);
      setIsSaving(false);
      setShowSavedFeedback(true);
      setTimeout(() => {
        setShowSavedFeedback(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to save tool', err);
      setIsSaving(false);
      alert('保存失败，请检查网络或后端状态');
    }
  };

  const deleteTool = async (id: string) => {
    try {
      await api.deleteTool(id);
      const newTools = tools.filter(t => t.id !== id);
      setTools(newTools);
      setSavedTools(prev => prev.filter(t => t.id !== id));
      if (activeToolId === id) {
        setActiveToolId(newTools[0]?.id || null);
      }
    } catch (err) {
      console.error('Failed to delete tool', err);
    }
  };

  const fetchLogs = async () => {
    if (!activeToolId) return;
    setIsLoadingLogs(true);
    try {
      const data = await api.getLogs(activeToolId);
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab, activeToolId]);

  const runTest = async () => {
    if (!activeTool) return;
    setIsExecuting(true);
    setExecutionResult(null);
    try {
      const data = await api.executeProxy(activeTool, testValues);
      setExecutionResult(data);
      if (activeTab === 'logs') fetchLogs();
    } catch (err: any) {
      setExecutionResult({ error: err.message });
      if (activeTab === 'logs') fetchLogs();
    } finally {
      setIsExecuting(false);
    }
  };

  const formatRequestBody = () => {
    if (!activeTool) return;

    try {
      const formatted = JSON.stringify(JSON.parse(activeTool.body), null, 2);
      handleUpdateTool({ body: formatted });
    } catch {
      alert('当前请求体不是有效的 JSON，暂时无法格式化。');
    }
  };

  const getDebugResponsePayload = () => {
    if (!executionResult) return undefined;
    if (executionResult.error !== undefined) return executionResult.error;

    const response = executionResult.response;
    if (!response) return undefined;
    if (response.returnValue !== undefined) return response.returnValue;
    if (response.filteredData !== undefined) return response.filteredData;
    if (response.data !== undefined) return response.data;
    return response;
  };

  const debugResponsePayload = getDebugResponsePayload();
  const debugResponseText = debugResponsePayload === undefined
    ? ''
    : typeof debugResponsePayload === 'string'
      ? debugResponsePayload
      : JSON.stringify(debugResponsePayload, null, 2);

  const formatRelativeTime = (timestamp?: number) => {
    if (!timestamp) return '无活动';
    const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSeconds < 5) return '刚刚';
    if (diffSeconds < 60) return `${diffSeconds}s 前`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m 前`;
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h 前`;
  };

  const visibleSessions = (serverStatus.sessions || []).slice(0, 1);
  const hiddenSessionCount = Math.max(0, (serverStatus.sessions || []).length - visibleSessions.length);

  const parseCurl = async (curlString: string) => {
    try {
      // 清理多行和反斜杠
      const cleanCurl = curlString.replace(/\\\n/g, ' ').replace(/\n/g, ' ').trim();
      
      // 解析 Method
      const methodMatch = cleanCurl.match(/-X\s+([A-Z]+)/i) || cleanCurl.match(/--request\s+([A-Z]+)/i);
      let method = (methodMatch ? methodMatch[1].toUpperCase() : 'GET') as any;
      if (cleanCurl.includes('--data') || cleanCurl.includes('-d ') || cleanCurl.includes('--data-raw')) {
        if (!methodMatch) method = 'POST';
      }
      
      // 解析 URL - 支持没有协议前缀的 URL
      let url = '';
      const urlMatch = cleanCurl.match(/'(https?:\/\/[^']+)'/) || cleanCurl.match(/"(https?:\/\/[^"]+)"/) || cleanCurl.match(/\s(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        url = urlMatch[1];
      } else {
        // 尝试匹配没有协议前缀的 URL
        const urlWithoutProtocolMatch = cleanCurl.match(/'([^'"]+)'/) || cleanCurl.match(/"([^'"]+)"/);
        if (urlWithoutProtocolMatch) {
          // 添加默认的 http:// 协议
          url = `http://${urlWithoutProtocolMatch[1]}`;
        }
      }

      // 解析 Headers - 支持 -H 和 --header 选项
      const headers: { key: string; value: string }[] = [];
      const headerMatches = cleanCurl.matchAll(/(?:-H|--header)\s+['"]([^'"]+)['"]/g);
      for (const match of headerMatches) {
        const parts = match[1].split(/:\s*(.*)/);
        if (parts.length >= 2) {
          headers.push({ key: parts[0], value: parts[1] });
        }
      }

      // 解析 Body - 更健壮的匹配模式
      let body = '{}';
      // 查找 --data, --data-raw, -d 选项后的内容
      // 使用更准确的模式匹配 Body
      const bodyMatch = cleanCurl.match(/--data(?:-raw)?\s+(?:'([^']+)'|"([^"]+)"|(\S+))/) || 
                        cleanCurl.match(/-d\s+(?:'([^']+)'|"([^"]+)"|(\S+))/);
      
      if (bodyMatch) {
        // 找到匹配的分组
        const matchedBody = bodyMatch[1] || bodyMatch[2] || bodyMatch[3];
        if (matchedBody) {
          // 清理 Body 内容
          body = matchedBody.trim().replace(/\s+/g, ' ');
        }
      }

      // --- 自动参数提取 (模仿 Postman) ---
      const parameters: MCPParameter[] = [];

      // 1. 提取 URL Query Params
      try {
        const urlParts = url.split('?');
        if (urlParts.length > 1) {
          const searchParams = new URLSearchParams(urlParts[1]);
          searchParams.forEach((value, key) => {
            parameters.push({
              name: key,
              type: isNaN(Number(value)) ? 'string' : 'number',
              required: true,
              description: `URL 参数: ${key} (示例: ${value})`
            });
            // 将 URL 中的值替换为占位符
            url = url.replace(`${key}=${value}`, `${key}={{${key}}}`);
          });
        }
      } catch (e) {
        console.warn('URL parsing failed during cURL import', e);
      }

      // 2. 提取 JSON Body Params
      try {
        const jsonBody = JSON.parse(body);
        if (typeof jsonBody === 'object' && jsonBody !== null) {
          Object.entries(jsonBody).forEach(([key, value]) => {
            if (!parameters.find(p => p.name === key)) {
              parameters.push({
                name: key,
                type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
                required: true,
                description: `Body 参数: ${key} (示例: ${value})`
              });
            }
            // 将 Body 中的值替换为占位符
            if (typeof value === 'string') {
              body = body.replace(`"${key}": "${value}"`, `"${key}": "{{${key}}}"`);
            } else {
              body = body.replace(`"${key}": ${value}`, `"${key}": "{{${key}}}"`);
            }
          });
        }
      } catch (e) {
        // Body 不是 JSON 或解析失败
      }

      const toolName = url.split('/').pop()?.split('?')[0] || 'new_tool';

      const newTool: MCPTool = {
        id: Math.random().toString(36).substr(2, 9),
        name: toolName.replace(/[^a-zA-Z0-9_]/g, '_'),
        description: `Imported from cURL: ${urlMatch ? urlMatch[1] : ''}`,
        method,
        url,
        headers,
        body,
        responseFilter: '',
        parameters,
        responseFields: [createResponseField({ name: 'root', path: '$', type: 'object', children: [] })],
        createdAt: Date.now()
      };

      // 立即保存到 SQLite
      await api.saveTool(newTool);
      
      setTools([newTool, ...tools]);
      setActiveToolId(newTool.id);
      setIsImportModalOpen(false);
      setCurlInput('');
    } catch (err) {
      alert('解析 cURL 失败，请检查格式是否正确（建议从 Chrome DevTools 复制）');
    }
  };

  const handleImportCurl = () => {
    setIsImportModalOpen(true);
  };

  // Auto-extract parameters from URL and Body
  useEffect(() => {
    if (!activeTool) return;
    const combined = activeTool.url + activeTool.body;
    const matches = combined.match(/\{\{([^}]+)\}\}/g);
    
    const paramNames = matches ? Array.from(new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))) : [];
    const existingParams = activeTool.parameters;
    
    // Merge new parameters with existing ones to preserve descriptions
    const newParams: MCPParameter[] = paramNames.map(name => {
      const existing = existingParams.find(p => p.name === name);
      return existing || { name, type: 'string', required: true, description: '' };
    });

    // Remove parameters that are no longer in the URL or Body
    const finalParams = newParams.filter(p => paramNames.includes(p.name));
    
    // Only update if changed to avoid loops
    if (JSON.stringify(finalParams) !== JSON.stringify(existingParams)) {
      handleUpdateTool({ parameters: finalParams });
    }
  }, [activeTool?.url, activeTool?.body]);

  const filteredTools = tools.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const groupedTools = useMemo(() => {
    const groups: Record<string, MCPTool[]> = {};
    
    // 1. 初始化所有已知文件夹（包括空的）
    const allFolderNames = new Set(['默认', ...customFolders]);
    tools.forEach(t => { if (t.folder) allFolderNames.add(t.folder); });
    
    allFolderNames.forEach(name => {
      groups[name] = [];
    });

    // 2. 填充过滤后的工具
    filteredTools.forEach(tool => {
      const folder = tool.folder || '默认';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(tool);
    });

    // 3. 如果正在搜索，隐藏不匹配且为空的文件夹
    if (searchQuery) {
      const filteredGroups: Record<string, MCPTool[]> = {};
      Object.entries(groups).forEach(([name, tools]) => {
        if (tools.length > 0 || name.toLowerCase().includes(searchQuery.toLowerCase())) {
          filteredGroups[name] = tools;
        }
      });
      return filteredGroups;
    }

    return groups;
  }, [tools, filteredTools, customFolders, searchQuery]);

  const folders = useMemo(() => Object.keys(groupedTools).sort(), [groupedTools]);

  const handleRename = async (tool: MCPTool) => {
    if (!editingName.trim()) {
      setEditingToolId(null);
      return;
    }
    try {
      const updatedTool = { ...tool, name: editingName.trim() };
      setTools(tools.map(t => t.id === tool.id ? updatedTool : t));
      await api.saveTool(updatedTool);
    } catch (err) {
      console.error('Failed to rename tool', err);
    } finally {
      setEditingToolId(null);
    }
  };

  const handleCreateFolder = () => {
    setNewFolderName('');
    setIsFolderModalOpen(true);
  };

  const confirmCreateFolder = async () => {
    const name = newFolderName.trim();
    if (name && !customFolders.includes(name)) {
      try {
        const newFolders = [...customFolders, name];
        setCustomFolders(newFolders);
        setExpandedFolders({ ...expandedFolders, [name]: true });
        await api.updateSetting('customFolders', newFolders);
      } catch (err) {
        console.error('Failed to create folder', err);
      } finally {
        setIsFolderModalOpen(false);
      }
    }
  };

  const handleDeleteFolder = async (folder: string) => {
    if (folder === '默认') return;
    
    // Use a simpler confirmation for now or just do it
    try {
      const newFolders = customFolders.filter(f => f !== folder);
      setCustomFolders(newFolders);
      
      // Move tools to '默认'
      const updatedTools = tools.map(t => t.folder === folder ? { ...t, folder: '默认' } : t);
      setTools(updatedTools);
      
      // Update DB for all affected tools
      const affectedTools = tools.filter(t => t.folder === folder);
      for (const tool of affectedTools) {
        await api.saveTool({ ...tool, folder: '默认' });
      }
      
      await api.updateSetting('customFolders', newFolders);
    } catch (err) {
      console.error('Failed to delete folder', err);
    }
  };

  const handleMoveToFolder = async (tool: MCPTool, folder: string) => {
    try {
      const updatedTool = { ...tool, folder };
      setTools(tools.map(t => t.id === tool.id ? updatedTool : t));
      await api.saveTool(updatedTool);
    } catch (err) {
      console.error('Failed to move tool to folder', err);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <div className={cn(
        "drag-region flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-900/85 px-4 backdrop-blur-xl",
        isMacDesktop && "pl-24"
      )}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white shadow-[0_10px_30px_rgba(147,51,234,0.28)]">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">MCP Bridge | MCP 桥接器</div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
              Desktop Workspace
            </div>
          </div>
        </div>

        <div className="no-drag flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs font-medium text-zinc-400 transition-all hover:border-zinc-700 hover:text-zinc-200"
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === 'dark' ? '浅色' : '深色'}
          </button>
          <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-[10px] font-medium text-zinc-500">
            {appInfo?.localIp ? `MCP ${appInfo.localIp}:${appInfo.serverPort}` : 'Desktop Mode'}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 flex flex-col bg-zinc-900/50">
        <div className="p-4 border-bottom border-zinc-800 flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">Workspace</div>
              <div className="text-xs font-medium text-zinc-300">工具与配置</div>
            </div>
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="SSE Active" />
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Claude Linked" />
            </div>
          </div>

          {/* MCP SSE URL Display */}
          <div className="bg-zinc-950 rounded-lg p-2 border border-zinc-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">MCP 配置</span>
              {copySuccess && <span className="text-[9px] text-emerald-400 font-bold animate-in fade-in">已复制!</span>}
            </div>
            <div className="flex items-center gap-2">
              <code className="text-[10px] text-purple-400 truncate flex-1 font-mono">{mcpUrl}</code>
              <button 
                onClick={copyMcpConfig}
                className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-500 hover:text-zinc-300"
                title="复制 MCP 配置"
              >
                <RefreshCw className={cn("w-3 h-3", copySuccess && "text-emerald-400")} />
              </button>
            </div>
          </div>

          {/* API Key Display */}
          {((globalSettings.apiKey && typeof globalSettings.apiKey === 'string') || showApiKey) && (
            <div className="bg-zinc-950 rounded-lg p-2 border border-zinc-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">API Key</span>
                {copySuccess && <span className="text-[9px] text-emerald-400 font-bold animate-in fade-in">已复制!</span>}
              </div>
              <div className="flex items-center gap-2">
                <code className="text-[10px] text-purple-400 truncate flex-1 font-mono">
                  {showApiKey ? globalSettings.apiKey : '••••••••' + (typeof globalSettings.apiKey === 'string' ? globalSettings.apiKey.slice(-4) : '')}
                </code>
                <button 
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-500 hover:text-zinc-300"
                >
                  {showApiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
                <button 
                  onClick={() => {
                    if (globalSettings.apiKey && typeof globalSettings.apiKey === 'string') {
                      copyToClipboard(globalSettings.apiKey);
                    }
                  }}
                  className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-500 hover:text-zinc-300"
                >
                  <RefreshCw className={cn("w-3 h-3", copySuccess && "text-emerald-400")} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <button 
              onClick={handleCreateTool}
              className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-all active:scale-95 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              新建工具
            </button>
            <button 
              onClick={handleCreateFolder}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg border border-zinc-700 transition-all active:scale-95"
              title="新建文件夹"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={handleImportCurl}
            className="w-full py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium flex items-center justify-center gap-2 transition-all active:scale-95 border border-zinc-700 text-xs"
          >
            <Terminal className="w-4 h-4" />
            ⤓ 导入 cURL
          </button>
          
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text" 
              placeholder="搜索工具..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-800 border-none rounded-lg pl-9 pr-4 py-2 text-xs focus:ring-1 focus:ring-purple-500 transition-all outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-4">
          {folders.map(folder => (
            <div key={folder} className="space-y-1">
              <div 
                role="button"
                tabIndex={0}
                onClick={() => setExpandedFolders({ ...expandedFolders, [folder]: !expandedFolders[folder] })}
                onKeyDown={(e) => e.key === 'Enter' && setExpandedFolders({ ...expandedFolders, [folder]: !expandedFolders[folder] })}
                className="w-full flex items-center gap-2 px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider hover:text-zinc-300 transition-colors group cursor-pointer outline-none"
              >
                {expandedFolders[folder] ? <ChevronDown key="down" className="w-3 h-3" /> : <ChevronRight key="right" className="w-3 h-3" />}
                <Folder key="folder" className="w-3 h-3" />
                <span className="flex-1 text-left">{folder}</span>
                {folder !== '默认' && (
                  <button 
                    key="delete-folder"
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 transition-all"
                    title="删除文件夹"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
                <span className="text-[9px] bg-zinc-800 px-1.5 rounded-full group-hover:bg-zinc-700 transition-colors">
                  {groupedTools[folder].length}
                </span>
              </div>

              {expandedFolders[folder] && (
                <div className="space-y-0.5 ml-2 border-l border-zinc-800 pl-1">
                  {groupedTools[folder].map(tool => (
                    <div key={tool.id} className="group relative">
                      {editingToolId === tool.id ? (
                        <input
                          key={`edit-${tool.id}`}
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleRename(tool)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRename(tool)}
                          className="w-full bg-zinc-800 text-zinc-100 text-xs px-2 py-1.5 rounded outline-none ring-1 ring-purple-500"
                        />
                      ) : (
                        <div
                          key={`view-${tool.id}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setActiveToolId(tool.id)}
                          onKeyDown={(e) => e.key === 'Enter' && setActiveToolId(tool.id)}
                          className={cn(
                            "w-full flex items-center gap-2 p-2 rounded-lg text-xs transition-all cursor-pointer outline-none",
                            activeToolId === tool.id ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                          )}
                        >
                          <MethodBadge method={tool.method} />
                          <span className="truncate flex-1 text-left">{tool.name}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              key="edit-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingToolId(tool.id);
                                setEditingName(tool.name);
                              }}
                              className="p-1 hover:text-purple-400"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button 
                              key="delete-btn"
                              onClick={(e) => { e.stopPropagation(); deleteTool(tool.id); }}
                              className="p-1 hover:text-rose-400"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-zinc-800 mt-auto">
          <button 
            onClick={() => setIsSettingsModalOpen(true)}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            <Settings className="w-4 h-4" />
            全局设置
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTool ? (
          <>
            {/* Header */}
            <header className="drag-region h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/20">
              <div className="flex items-center gap-4 flex-1">
                <input 
                  type="text" 
                  value={activeTool.name}
                  onChange={(e) => handleUpdateTool({ name: e.target.value })}
                  className="no-drag bg-transparent border-none text-xl font-bold focus:ring-0 outline-none w-full max-w-md"
                  placeholder="工具名称 (如: get_weather)"
                />
              </div>
              <div className="no-drag flex items-center gap-3">
                <select
                  value={activeTool.folder || '默认'}
                  onChange={(e) => handleMoveToFolder(activeTool, e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {folders.map(f => <option key={f} value={f}>{f}</option>)}
                  {!folders.includes('默认') && <option value="默认">默认</option>}
                </select>
                <button 
                  onClick={saveTool}
                  disabled={isSaving}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    showSavedFeedback 
                      ? 'bg-emerald-600 text-white' 
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                  }`}
                >
                  {isSaving ? (
                    <RefreshCw key="saving" className="w-4 h-4 animate-spin" />
                  ) : showSavedFeedback ? (
                    <CheckCircle2 key="saved" className="w-4 h-4" />
                  ) : (
                    <Save key="save" className="w-4 h-4" />
                  )}
                  {showSavedFeedback ? '已保存' : '保存'}
                </button>

              </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Description Card */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">工具用途说明</label>
                    <p className="text-xs text-zinc-500">给模型看的摘要。建议写清什么时候调用、关键参数代表什么、返回的核心结果是什么。</p>
                  </div>
                  <button
                    onClick={() => setIsPreviewModalOpen(true)}
                    className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-950 hover:text-zinc-100"
                  >
                    MCP 预览
                  </button>
                </div>
                <textarea 
                  value={activeTool.description}
                  onChange={(e) => handleUpdateTool({ description: e.target.value })}
                  placeholder="例如：根据订单号查询订单详情，适合在用户已经提供订单号后调用。返回订单状态、金额、收货信息等结构化数据。"
                  className="w-full min-h-[76px] resize-none rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-300 outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* Request Definition */}
              <div className="flex gap-3">
                <select 
                  value={activeTool.method}
                  onChange={(e) => handleUpdateTool({ method: e.target.value as any })}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-bold text-zinc-300 outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>DELETE</option>
                  <option>PATCH</option>
                </select>
                <div className="flex-1 relative">
                  <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input 
                    type="text" 
                    value={activeTool.url}
                    onChange={(e) => handleUpdateTool({ url: e.target.value })}
                    placeholder="https://api.example.com/v1/resource/{{id}}"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-sm font-mono focus:ring-1 focus:ring-purple-500 outline-none"
                  />
                </div>
              </div>

              {/* Tabs */}
              <div className="space-y-4">
                <div className="flex border-b border-zinc-800">
                  {[
                    { id: 'params', label: '参数提取', icon: Cpu },
                    { id: 'query', label: 'Params (URL)', icon: Link2 },
                    { id: 'headers', label: '请求头', icon: ShieldCheck },
                    { id: 'body', label: '请求体', icon: Code },
                    { id: 'output', label: '响应处理', icon: FileJson },
                    { id: 'logs', label: '调用日志', icon: History },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all border-b-2 -mb-[2px]",
                        activeTab === tab.id ? "border-purple-500 text-purple-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="min-h-[300px]">
                  {activeTab === 'query' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">URL 查询参数 (Query Params)</label>
                        <Badge variant="blue">Auto-Sync</Badge>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-zinc-500 text-left border-b border-zinc-800">
                            <th className="pb-2 font-medium">Key</th>
                            <th className="pb-2 font-medium">Value</th>
                            <th className="pb-2 font-medium w-20">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {(() => {
                            try {
                              const urlParts = activeTool.url.split('?');
                              if (urlParts.length <= 1) return (
                                <tr>
                                  <td colSpan={3} className="py-8 text-center text-zinc-600 italic">URL 中暂无查询参数</td>
                                </tr>
                              );
                              const searchParams = new URLSearchParams(urlParts[1]);
                              const rows: any[] = [];
                              searchParams.forEach((value, key) => {
                                rows.push(
                                  <tr key={key}>
                                    <td className="py-3 font-mono text-zinc-300">{key}</td>
                                    <td className="py-3">
                                      <input 
                                        type="text" 
                                        value={value}
                                        onChange={(e) => {
                                          const newParams = new URLSearchParams(urlParts[1]);
                                          newParams.set(key, e.target.value);
                                          handleUpdateTool({ url: `${urlParts[0]}?${newParams.toString()}` });
                                        }}
                                        className="w-full bg-zinc-800 border-none rounded px-2 py-1 text-xs text-zinc-400 focus:ring-1 focus:ring-purple-500 outline-none"
                                      />
                                    </td>
                                    <td className="py-3">
                                      {!value.includes('{{') && (
                                        <button 
                                          onClick={() => {
                                            const newParams = new URLSearchParams(urlParts[1]);
                                            newParams.set(key, `{{${key}}}`);
                                            handleUpdateTool({ url: `${urlParts[0]}?${newParams.toString()}` });
                                          }}
                                          className="text-[10px] bg-purple-600/20 text-purple-400 px-2 py-1 rounded hover:bg-purple-600/40 transition-all"
                                          title="转为动态参数"
                                        >
                                          变参
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              });
                              return rows;
                            } catch (e) {
                              return null;
                            }
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {activeTab === 'params' && (
                    <div className="space-y-4">
                      {activeTool.parameters.length > 0 ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">参数定义</label>
                              <p className="mt-1 text-xs text-zinc-500">模型会根据这里的名称、类型、必填规则和说明来自动拼装参数。</p>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                              <Badge variant="default">{activeTool.parameters.length} 个参数</Badge>
                              <Badge variant="warning">{activeTool.parameters.filter(param => param.required).length} 个必填</Badge>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {activeTool.parameters.map((param, idx) => (
                              <div key={param.name} className="rounded-xl border border-zinc-800 bg-zinc-900/55 p-4">
                                <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_120px_100px] items-center">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-500">参数</span>
                                    <span className="truncate font-mono text-sm text-purple-400">{param.name}</span>
                                  </div>

                                  <div className="flex items-center gap-3 min-w-0">
                                    <label className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-500">参数说明</label>
                                    <input 
                                      type="text" 
                                      value={param.description}
                                      onChange={(e) => {
                                        const newParams = [...activeTool.parameters];
                                        newParams[idx].description = e.target.value;
                                        handleUpdateTool({ parameters: newParams });
                                      }}
                                      placeholder="例如：订单唯一标识，只支持系统生成的 orderId"
                                      className="w-full min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 outline-none focus:ring-1 focus:ring-purple-500"
                                    />
                                  </div>

                                  <div className="flex items-center gap-3">
                                    <label className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-500">类型</label>
                                    <select 
                                      value={param.type}
                                      onChange={(e) => {
                                        const newParams = [...activeTool.parameters];
                                        newParams[idx].type = e.target.value as any;
                                        handleUpdateTool({ parameters: newParams });
                                      }}
                                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-purple-500"
                                    >
                                      <option>string</option>
                                      <option>number</option>
                                      <option>boolean</option>
                                    </select>
                                  </div>

                                  <label className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">必填</span>
                                    <input 
                                      type="checkbox" 
                                      checked={param.required}
                                      onChange={(e) => {
                                        const newParams = [...activeTool.parameters];
                                        newParams[idx].required = e.target.checked;
                                        handleUpdateTool({ parameters: newParams });
                                      }}
                                      className="rounded bg-zinc-800 border-zinc-700 text-purple-600 focus:ring-0"
                                    />
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-zinc-500 space-y-2">
                          <Terminal className="w-8 h-8 opacity-20" />
                          <p className="text-sm">在 URL 或 Body 中使用 {"{{变量名}}"} 自动提取参数</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'headers' && (
                    <div className="space-y-3">
                      {activeTool.headers.map((header, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input 
                            type="text" 
                            value={header.key}
                            onChange={(e) => {
                              const newHeaders = [...activeTool.headers];
                              newHeaders[idx].key = e.target.value;
                              handleUpdateTool({ headers: newHeaders });
                            }}
                            placeholder="Key"
                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono outline-none"
                          />
                          <input 
                            type="text" 
                            value={header.value}
                            onChange={(e) => {
                              const newHeaders = [...activeTool.headers];
                              newHeaders[idx].value = e.target.value;
                              handleUpdateTool({ headers: newHeaders });
                            }}
                            placeholder="Value"
                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono outline-none"
                          />
                          <button 
                            onClick={() => {
                              const newHeaders = activeTool.headers.filter((_, i) => i !== idx);
                              handleUpdateTool({ headers: newHeaders });
                            }}
                            className="p-2 text-zinc-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={() => handleUpdateTool({ headers: [...activeTool.headers, { key: '', value: '' }] })}
                        className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> 添加 Header
                      </button>
                    </div>
                  )}

                  {activeTab === 'body' && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="bg-zinc-800/50 px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">JSON Body</span>
                          <Badge variant="purple">JSON</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={formatRequestBody}
                            className="text-[10px] bg-zinc-700/70 text-zinc-300 px-2 py-1 rounded hover:bg-zinc-700 transition-all flex items-center gap-1"
                          >
                            <Code className="w-3 h-3" />
                            格式化
                          </button>
                          <button 
                            onClick={() => {
                              try {
                                const json = JSON.parse(activeTool.body);
                                let newBody = activeTool.body;
                                Object.entries(json).forEach(([key, value]) => {
                                  if (typeof value === 'string' && !String(value).includes('{{')) {
                                    newBody = newBody.replace(`"${key}": "${value}"`, `"${key}": "{{${key}}}"`);
                                  } else if (typeof value !== 'object' && !String(value).includes('{{')) {
                                    newBody = newBody.replace(`"${key}": ${value}`, `"${key}": "{{${key}}}"`);
                                  }
                                });
                                handleUpdateTool({ body: newBody });
                              } catch (e) {
                                alert('Body 不是有效的 JSON，无法自动提取参数');
                              }
                            }}
                            className="text-[10px] bg-purple-600/20 text-purple-400 px-2 py-1 rounded hover:bg-purple-600/40 transition-all flex items-center gap-1"
                          >
                            <Sparkles className="w-3 h-3" />
                            自动变参
                          </button>
                        </div>
                      </div>
                      <textarea 
                        value={activeTool.body}
                        onChange={(e) => handleUpdateTool({ body: e.target.value })}
                        className="w-full h-64 bg-transparent p-4 font-mono text-sm resize-none focus:ring-0 outline-none text-zinc-300"
                        placeholder='{ "key": "{{variable}}" }'
                      />
                    </div>
                  )}

                  {activeTab === 'output' && (
                    <div className="space-y-4">
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">提取 JSONPath (选填)</label>
                          <input 
                            type="text" 
                            value={activeTool.responseFilter}
                            onChange={(e) => handleUpdateTool({ responseFilter: e.target.value })}
                            placeholder="例如: data.result"
                            className="w-full bg-zinc-800 border-none rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-purple-500"
                          />
                          <p className="text-xs text-zinc-500 leading-relaxed">
                            先用 JSONPath 把原始响应裁成核心片段，再按下方字段树决定哪些属性返回给调用端。最终发送给调用端的内容会保持 JSON 格式。
                          </p>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">返回值字段与返回开关</label>
                          </div>
                          <button 
                            onClick={() => addResponseChildField()}
                            className="text-xs bg-purple-600/20 text-purple-400 px-3 py-1.5 rounded hover:bg-purple-600/40 transition-all flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> 添加字段
                          </button>
                        </div>

                        {activeTool.responseFields.length > 0 ? (
                          <ResponseFieldTreeEditor
                            fields={activeTool.responseFields}
                            expandedMap={expandedResponseFields}
                            onToggle={(fieldId) => setExpandedResponseFields(prev => ({ ...prev, [fieldId]: !prev[fieldId] }))}
                            onUpdate={updateResponseField}
                            onAddChild={addResponseChildField}
                            onDelete={deleteResponseField}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center py-8 text-zinc-500 space-y-2">
                            <Sparkles className="w-8 h-8 opacity-20" />
                            <p className="text-xs">添加返回值字段说明，帮助大模型理解接口响应</p>
                          </div>
                        )}

                        <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2 text-purple-400">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium">这个区域现在怎么工作？</span>
                          </div>
                          <ul className="text-[10px] text-zinc-500 space-y-1 ml-5">
                            <li>• JSONPath 决定从原始响应里提取哪一段作为后续处理输入</li>
                            <li>• 勾选“返回”表示该字段会真正返回给调用端，默认勾选</li>
                            <li>• 没勾选的字段只作为结构说明存在，不会出现在最终返回 JSON 中</li>
                            <li>• `object` 和 `array` 节点可以继续展开子字段</li>
                            <li>• 路径会在内部自动维护，界面上无需手写 `[0].name`</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'logs' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">最近调用记录</label>
                          <Badge variant="default">仅保留24小时</Badge>
                        </div>
                        <button 
                          onClick={fetchLogs}
                          className="text-zinc-500 hover:text-zinc-300 transition-colors"
                          disabled={isLoadingLogs}
                        >
                          <RefreshCw className={cn("w-3 h-3", isLoadingLogs && "animate-spin")} />
                        </button>
                      </div>

                      <div className="space-y-2">
                        {logs.length === 0 ? (
                          <div className="py-12 text-center bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl">
                            <Clock className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                            <p className="text-sm text-zinc-500">暂无调用记录</p>
                          </div>
                        ) : (
                          logs.map(log => (
                            <div key={log.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                              <div className="px-4 py-2 bg-zinc-800/30 flex items-center justify-between border-b border-zinc-800">
                                <div className="flex items-center gap-3">
                                  {log.status >= 200 && log.status < 300 ? (
                                    <CheckCircle2 key="success" className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <XCircle key="error" className="w-3.5 h-3.5 text-rose-500" />
                                  )}
                                  <span className={cn(
                                    "text-xs font-bold",
                                    log.status >= 200 && log.status < 300 ? "text-emerald-400" : "text-rose-400"
                                  )}>
                                    {log.status}
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-mono">
                                    {new Date(log.timestamp).toLocaleString()}
                                  </span>
                                </div>
                                <Badge variant="default" className="text-[9px]">{log?.method}</Badge>
                              </div>
                              <div className="p-3 space-y-3">
                                <div className="space-y-1">
                                  <div className="text-[9px] text-zinc-600 font-bold uppercase">URL</div>
                                  <div className="text-[10px] text-zinc-400 font-mono break-all">{log.url}</div>
                                </div>
                                {log.error && (
                                  <div className="p-2 bg-rose-500/5 border border-rose-500/20 rounded text-[10px] text-rose-400 font-mono">
                                    Error: {log.error}
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <div className="text-[9px] text-zinc-600 font-bold uppercase">Request Body</div>
                                    <pre className="text-[9px] text-zinc-500 bg-black/30 p-2 rounded overflow-x-auto max-h-32 font-mono">
                                      {JSON.stringify(log.requestBody, null, 2)}
                                    </pre>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="text-[9px] text-zinc-600 font-bold uppercase">Response Body</div>
                                    <pre className="text-[9px] text-zinc-500 bg-black/30 p-2 rounded overflow-x-auto max-h-32 font-mono">
                                      {JSON.stringify(log.responseBody, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 space-y-4">
            <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800">
              <Zap className="w-8 h-8 opacity-20" />
            </div>
            <div className="text-center">
              <h3 className="text-zinc-200 font-medium">选择或创建一个工具</h3>
              <p className="text-sm">开始构建你的 MCP 代理网关</p>
            </div>
          </div>
        )}
      </main>

      {/* MCP Preview Modal */}
      <AnimatePresence>
        {isPreviewModalOpen && activeTool && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPreviewModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
            >
              <div className="p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg text-zinc-100">{activeTool.name}</span>
                      <MethodBadge method={activeTool.method} />
                    </div>
                    <p className="text-sm text-zinc-500">这是当前工具发给 MCP client 的摘要预览。</p>
                  </div>
                  <button
                    onClick={() => setIsPreviewModalOpen(false)}
                    className="rounded-lg p-2 transition-colors hover:bg-zinc-800"
                  >
                    <XCircle className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">输入参数</div>
                    <div className="mt-1 text-sm text-zinc-200">{activeTool.parameters.length}</div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">必填参数</div>
                    <div className="mt-1 text-sm text-zinc-200">{activeTool.parameters.filter(param => param.required).length}</div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">返回字段</div>
                    <div className="mt-1 text-sm text-zinc-200">{getResponseFieldSummary(activeTool.responseFields || []).length}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">描述预览</div>
                  <pre className="mt-3 whitespace-pre-wrap text-[12px] leading-6 text-zinc-300">
                    {mcpToolPreview?.description || '这里会根据工具描述、参数说明和返回字段自动生成更清晰的 MCP 摘要。'}
                  </pre>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Session Monitor Modal */}
      <AnimatePresence>
        {isSessionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSessionModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
            >
              <div className="p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-zinc-100">MCP 会话监控</span>
                      <Badge variant="default">{serverStatus.sessions?.length || 0} 条</Badge>
                    </div>
                    <p className="text-sm text-zinc-500">查看当前活跃 SSE 会话的初始化状态、最近方法和最后活动时间。</p>
                  </div>
                  <button
                    onClick={() => setIsSessionModalOpen(false)}
                    className="rounded-lg p-2 transition-colors hover:bg-zinc-800"
                  >
                    <XCircle className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
                  {(serverStatus.sessions || []).length > 0 ? (
                    (serverStatus.sessions || []).map((session) => (
                      <div key={session.sessionId} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <code className="text-xs text-zinc-300 font-mono break-all">{session.sessionId}</code>
                          <span className={cn(
                            "text-[10px] font-bold shrink-0",
                            session.initialized ? "text-emerald-400" : "text-amber-400"
                          )}>
                            {session.initialized ? '已初始化' : '待初始化'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
                          <div>最近方法：<span className="font-mono text-zinc-300">{session.lastMethod}</span></div>
                          <div>最后活动：<span className="text-zinc-300">{formatRelativeTime(session.lastActivityAt)}</span></div>
                          <div>消息数：<span className="text-zinc-300">{session.messageCount}</span></div>
                          <div>来源：<span className="text-zinc-300">{session.remoteAddress || 'unknown ip'}</span></div>
                        </div>
                        {session.lastError && (
                          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                            {session.lastError}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-500">
                      当前没有活跃的 MCP SSE 会话。
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* cURL Import Modal */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsImportModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center">
                    <Terminal className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">导入 cURL 命令</h3>
                    <p className="text-xs text-zinc-500">粘贴 cURL 代码，我们将自动识别 URL、方法、Header 和 Body</p>
                  </div>
                </div>

                <div className="bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
                  <textarea 
                    value={curlInput}
                    onChange={(e) => setCurlInput(e.target.value)}
                    placeholder="curl 'https://api.example.com' -H 'Authorization: Bearer ...' --data-raw '...'"
                    className="w-full h-64 p-4 font-mono text-sm bg-transparent border-none focus:ring-0 outline-none text-zinc-300 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
                  >
                    取消
                  </button>
                  <button 
                    onClick={() => parseCurl(curlInput)}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-purple-500/20"
                  >
                    开始解析并导入
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Folder Modal */}
      <AnimatePresence>
        {isFolderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFolderModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center">
                    <FolderPlus className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">新建文件夹</h3>
                    <p className="text-xs text-zinc-500">为你的工具创建一个新的分类</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">文件夹名称</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmCreateFolder()}
                    placeholder="例如: 生产工具, 测试接口..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button 
                    onClick={() => setIsFolderModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
                  >
                    取消
                  </button>
                  <button 
                    onClick={confirmCreateFolder}
                    disabled={!newFolderName.trim()}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-purple-500/20"
                  >
                    创建
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Settings Modal */}
      <AnimatePresence>
        {isSettingsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center border border-zinc-700">
                      <Settings className="w-6 h-6 text-zinc-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">全局设置</h3>
                      <p className="text-xs text-zinc-500">配置全局生效的请求头和代理设置</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsSettingsModalOpen(false)}
                    className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    <XCircle className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">界面主题</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTheme('dark')}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                          theme === 'dark'
                            ? "border-purple-500 bg-purple-500/15 text-purple-400"
                            : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                        )}
                      >
                        深色模式
                      </button>
                      <button
                        onClick={() => setTheme('light')}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                          theme === 'light'
                            ? "border-purple-500 bg-purple-500/15 text-purple-400"
                            : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                        )}
                      >
                        浅色模式
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">全局请求头 (Global Headers)</label>
                      <button 
                        onClick={() => handleUpdateSetting('globalHeaders', [...globalSettings.globalHeaders, { key: '', value: '' }])}
                        className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> 添加 Header
                      </button>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                      {globalSettings.globalHeaders.length === 0 ? (
                        <p className="text-xs text-zinc-600 italic py-2">暂无全局 Header，例如可在此配置通用的 API Key</p>
                      ) : (
                        globalSettings.globalHeaders.map((header, idx) => (
                          <div key={idx} className="flex gap-2">
                            <input 
                              type="text" 
                              value={header.key}
                              onChange={(e) => {
                                const newHeaders = [...globalSettings.globalHeaders];
                                newHeaders[idx].key = e.target.value;
                                handleUpdateSetting('globalHeaders', newHeaders);
                              }}
                              placeholder="Key (如 Authorization)"
                              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-purple-500"
                            />
                            <input 
                              type="text" 
                              value={header.value}
                              onChange={(e) => {
                                const newHeaders = [...globalSettings.globalHeaders];
                                newHeaders[idx].value = e.target.value;
                                handleUpdateSetting('globalHeaders', newHeaders);
                              }}
                              placeholder="Value"
                              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-purple-500"
                            />
                            <button 
                              onClick={() => {
                                const newHeaders = globalSettings.globalHeaders.filter((_, i) => i !== idx);
                                handleUpdateSetting('globalHeaders', newHeaders);
                              }}
                              className="p-2 text-zinc-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">API Key (访问密钥)</label>
                    <input 
                      type="text" 
                      value={globalSettings.apiKey || ''}
                      onChange={(e) => handleUpdateSetting('apiKey', e.target.value)}
                      placeholder="输入访问 API 所需的密钥"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    <p className="text-[10px] text-zinc-600">
                      用于验证 MCP Bridge 访问请求，配置后会启用认证
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">代理服务器 (Proxy URL - 选填)</label>
                    <input 
                      type="text" 
                      value={globalSettings.proxyUrl}
                      onChange={(e) => handleUpdateSetting('proxyUrl', e.target.value)}
                      placeholder="http://proxy.example.com:8080"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    <p className="text-[10px] text-zinc-600">
                      如果设置了代理，所有请求将通过此代理发出。
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800 flex justify-end">
                  <button 
                    onClick={() => setIsSettingsModalOpen(false)}
                    className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-bold transition-all"
                  >
                    完成
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Debug Console */}
      <aside className="w-80 border-l border-zinc-800 flex flex-col bg-zinc-900/30">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-zinc-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">调试面板</span>
          </div>
          <button 
            onClick={runTest}
            disabled={isExecuting || !activeTool}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-all"
          >
            {isExecuting ? <RefreshCw key="executing" className="w-3 h-3 animate-spin" /> : <Play key="play" className="w-3 h-3" />}
            运行测试
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">模拟大模型调用参数</label>
            {activeTool?.parameters.length ? (
              <div className="space-y-3">
                {activeTool.parameters.map(param => (
                  <div key={param.name} className="space-y-1">
                    <span className="text-xs text-zinc-400 font-mono">{param.name}</span>
                    <input 
                      type="text" 
                      value={testValues[param.name] || ''}
                      onChange={(e) => setTestValues({ ...testValues, [param.name]: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500"
                      placeholder={`输入 ${param.name}...`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 italic">暂无动态参数</p>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Request</label>
                <Badge variant="default">HTTP</Badge>
              </div>
              <div className="bg-zinc-950 rounded-xl p-3 border border-zinc-800 space-y-2">
                <div className="text-[10px] font-mono text-zinc-300 break-all">
                  {activeTool ? `${activeTool.method} ${activeTool.url}` : '未选择工具'}
                </div>
                {activeTool?.responseFilter ? (
                  <div className="text-[10px] text-zinc-500 break-all">
                    JSONPath: <span className="font-mono text-zinc-400">{activeTool.responseFilter}</span>
                  </div>
                ) : (
                  <div className="text-[10px] text-zinc-600">未配置 JSONPath，将直接基于整个接口响应构造返回 JSON</div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Response</label>
                  {executionResult ? (
                    <Badge variant={executionResult.error ? 'warning' : executionResult.response?.status < 400 ? 'success' : 'warning'}>
                      {executionResult.error ? 'Error' : executionResult.response?.status || 'Done'}
                    </Badge>
                  ) : (
                    <Badge variant="default">Idle</Badge>
                  )}
                </div>
                {!executionResult?.error && (executionResult?.response?.filteredData !== undefined || executionResult?.response?.returnValue !== undefined) && (
                  <button
                    onClick={() => {
                      const sourceData = executionResult.response?.filteredData ?? executionResult.response?.returnValue;
                      if (sourceData !== undefined) {
                        const parsedFields = [parseResponseToFieldTree(sourceData)];
                        handleUpdateTool({ responseFields: parsedFields });
                        setActiveTab('output');
                      } else {
                        alert('无法解析返回数据');
                      }
                    }}
                    className="text-[10px] bg-purple-600/20 text-purple-400 px-2 py-1 rounded hover:bg-purple-600/40 transition-all flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    智能识别返回字段
                  </button>
                )}
              </div>

              <div className="bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
                <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                    {executionResult?.error ? 'Error Payload' : executionResult ? 'JSON Payload' : 'Waiting'}
                  </span>
                  {executionResult?.request?.url && (
                    <span className="text-[10px] text-zinc-600 font-mono truncate max-w-36">
                      {executionResult.request.method}
                    </span>
                  )}
                </div>

                {isExecuting ? (
                  <div className="p-4 text-xs text-zinc-500 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    正在请求接口并解析返回...
                  </div>
                ) : executionResult ? (
                  debugResponseText ? (
                    <div className="max-h-80 overflow-auto p-3">
                      <pre className={cn(
                        "text-[10px] font-mono whitespace-pre",
                        executionResult.error ? "text-rose-400" : "text-emerald-400"
                      )}>
                        {debugResponseText}
                      </pre>
                    </div>
                  ) : (
                    <div className="p-4 text-xs text-zinc-500">
                      本次调用已完成，但没有可展示的 JSON 内容。
                    </div>
                  )
                ) : (
                  <div className="p-4 text-xs text-zinc-600">
                    运行测试后，这里会展示当前工具的返回结果。
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* MCP Server Status Card */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/35">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">MCP 服务器状态</span>
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full animate-pulse",
                  serverStatus.activeConnections > 0 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-600"
                )} />
                <span className="text-[10px] text-zinc-500 font-medium">
                  {serverStatus.activeConnections > 0 ? `${serverStatus.activeConnections} 个客户端已连接` : "等待连接"}
                </span>
              </div>
            </div>
            
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-zinc-600 font-bold uppercase">MCP 配置</span>
                <button 
                  onClick={copyMcpConfig}
                  className="text-[9px] text-purple-400 hover:text-purple-300 font-bold transition-colors"
                >
                  {copySuccess ? "已复制" : "复制配置"}
                </button>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 py-1.5">
                <code className="text-[10px] text-zinc-400 font-mono break-all leading-relaxed">
                  {mcpUrl}
                </code>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-zinc-600 font-bold uppercase">会话监控</span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-zinc-500">
                    Tools v{serverStatus.toolsVersion ?? 0}
                  </span>
                  {(serverStatus.sessions?.length || 0) > 1 && (
                    <button
                      onClick={() => setIsSessionModalOpen(true)}
                      className="text-[9px] text-purple-400 hover:text-purple-300 font-bold transition-colors"
                    >
                      查看全部
                    </button>
                  )}
                </div>
              </div>
              {serverStatus.sessions && serverStatus.sessions.length > 0 ? (
                <div className="space-y-2">
                  {visibleSessions.map((session) => (
                    <div key={session.sessionId} className="rounded-lg border border-zinc-800 bg-zinc-950/55 px-2.5 py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-[10px] text-zinc-300 font-mono truncate">
                          {session.sessionId.slice(0, 8)}
                        </code>
                        <span className={cn(
                          "text-[9px] font-bold",
                          session.initialized ? "text-emerald-400" : "text-amber-400"
                        )}>
                          {session.initialized ? '已初始化' : '待初始化'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500">
                        <span className="font-mono">{session.lastMethod}</span>
                        <span>{formatRelativeTime(session.lastActivityAt)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-600">
                        <span>{session.messageCount} 条消息</span>
                        <span>{session.remoteAddress || 'unknown ip'}</span>
                      </div>
                      {session.lastError && (
                        <div className="text-[10px] text-rose-400 leading-relaxed">
                          {session.lastError}
                        </div>
                      )}
                    </div>
                  ))}
                  {hiddenSessionCount > 0 && (
                    <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/35 px-2.5 py-2 text-[10px] text-zinc-500">
                      另外还有 {hiddenSessionCount} 个会话，点击“查看全部”查看。
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2.5 py-2 text-[10px] text-zinc-600">
                  当前没有活跃的 MCP SSE 会话。
                </div>
              )}
            </div>

            <p className="text-[9px] text-zinc-600 leading-relaxed italic">
              支持 Claude Desktop, Cursor, Zed 等所有标准 MCP 客户端。
            </p>
          </div>
        </div>
      </aside>
      </div>
    </div>
  );
}
