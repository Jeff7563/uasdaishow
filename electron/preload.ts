import { contextBridge, ipcRenderer } from 'electron';
import type { WidgetData } from '../src/types/ccusage';

contextBridge.exposeInMainWorld('electronAPI', {
  fetchData: (): Promise<WidgetData> => ipcRenderer.invoke('ccusage:fetch'),
  onDataUpdated: (callback: (data: WidgetData) => void): (() => void) => {
    const subscription = (_event: any, data: WidgetData) => callback(data);
    ipcRenderer.on('ccusage:data-updated', subscription);
    return () => {
      ipcRenderer.removeListener('ccusage:data-updated', subscription);
    };
  },
  onSetExpandedState: (callback: (expanded: boolean) => void): (() => void) => {
    const subscription = (_event: any, expanded: boolean) => callback(expanded);
    ipcRenderer.on('widget:setExpandedState', subscription);
    return () => {
      ipcRenderer.removeListener('widget:setExpandedState', subscription);
    };
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  togglePin: (): Promise<boolean> => ipcRenderer.invoke('window:togglePin'),
  isPinned: (): Promise<boolean> => ipcRenderer.invoke('window:isPinned'),
  setExpanded: (expanded: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:setExpanded', expanded),
  setOpacity: (opacity: number): Promise<number> =>
    ipcRenderer.invoke('window:setOpacity', opacity),
  getOpacity: (): Promise<number> => ipcRenderer.invoke('window:getOpacity'),
  toggleStartup: (): Promise<boolean> => ipcRenderer.invoke('app:toggleStartup'),
  isStartupEnabled: (): Promise<boolean> => ipcRenderer.invoke('app:isStartupEnabled'),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('app:openExternal', url),
});
