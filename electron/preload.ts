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
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  togglePin: (): Promise<boolean> => ipcRenderer.invoke('window:togglePin'),
  isPinned: (): Promise<boolean> => ipcRenderer.invoke('window:isPinned'),
  setExpanded: (expanded: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:setExpanded', expanded),
});
