import { WidgetData } from './ccusage';

export interface IElectronAPI {
  fetchData: () => Promise<WidgetData>;
  onDataUpdated: (callback: (data: WidgetData) => void) => () => void;
  minimize: () => void;
  close: () => void;
  togglePin: () => Promise<boolean>;
  isPinned: () => Promise<boolean>;
  setExpanded: (expanded: boolean) => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
