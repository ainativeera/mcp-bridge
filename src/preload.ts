import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getTools: () => ipcRenderer.invoke('get-tools'),
  saveTool: (tool: any) => ipcRenderer.invoke('save-tool', tool),
  deleteTool: (id: string) => ipcRenderer.invoke('delete-tool', id),
  getLogs: (toolId: string) => ipcRenderer.invoke('get-logs', toolId),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSetting: (key: string, value: any) => ipcRenderer.invoke('update-setting', { key, value }),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  executeProxy: (data: any) => ipcRenderer.invoke('execute-proxy', data),
});
