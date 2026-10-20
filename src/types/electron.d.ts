import { WidgetData } from './ccusage';

export interface IElectronAPI {
  fetchData: () => Promise<WidgetData>;
  onDataUpdated: (callback: (data: WidgetData) => void) => () => void;
  onSetExpandedState: (callback: (expanded: boolean) => void) => () => void;
  minimize: () => void;
  close: () => void;
  togglePin: () => Promise<boolean>;
  isPinned: () => Promise<boolean>;
  setExpanded: (expanded: boolean) => void;
  setOpacity: (opacity: number) => Promise<number>;
  getOpacity: () => Promise<number>;
  toggleStartup: () => Promise<boolean>;
  isStartupEnabled: () => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
