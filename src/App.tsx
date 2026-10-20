import React, { useEffect, useState, useCallback, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { ProviderCard } from './components/ProviderCard';
import { SummaryPill } from './components/SummaryPill';
import { CollapsedBar } from './components/CollapsedBar';
import { ErrorMessage } from './components/ErrorMessage';
import type { WidgetData } from './types/ccusage';

// Mock data used when previewed in web browser without Electron
const MOCK_DATA: WidgetData = {
  lastUpdated: '14:50:00',
  lastSyncTimestamp: Date.now() - 14000,
  isWatcherActive: true,
  totalActiveTokens: 48_196_456,
  sessionLoadPercent: 26,
  activeProvidersCount: 3,
  providers: {
    claude: {
      id: 'claude',
      name: 'Claude',
      subtitle: 'Anthropic Pro/Max',
      models: ['claude-opus-5-5', 'claude-sonnet-4-6'],
      lastActive: 'Active just now',
      sessionLimit: {
        label: '5-Hour Session Remaining',
        percentRemaining: 74,
        percentUsed: 26,
        resetCountdown: 'Resets in 3h 15m',
        resetTimeDisplay: 'Today 18:00',
        status: 'normal',
      },
      weeklyLimit: {
        label: 'Weekly Limit Remaining',
        percentRemaining: 68,
        percentUsed: 32,
        resetCountdown: 'Resets in 4d 13h',
        resetTimeDisplay: 'Resets Sun 4:00 AM',
        status: 'normal',
      },
    },
    codex: {
      id: 'codex',
      name: 'Codex / GPT',
      subtitle: 'OpenAI Plus/Team',
      models: ['gpt-5.6-sol'],
      lastActive: 'Active 18m ago',
      sessionLimit: {
        label: '5-Hour Session Remaining',
        percentRemaining: 86,
        percentUsed: 14,
        resetCountdown: 'Resets in 4h 42m',
        resetTimeDisplay: 'Today 19:30',
        status: 'normal',
      },
      weeklyLimit: {
        label: 'Weekly Limit Remaining',
        percentRemaining: 82,
        percentUsed: 18,
        resetCountdown: 'Resets in 4d 13h',
        resetTimeDisplay: 'Resets Sun 4:00 AM',
        status: 'normal',
      },
    },
    antigravity: {
      id: 'antigravity',
      name: 'Antigravity',
      subtitle: 'Google Advanced',
      models: ['gemini-3.8-flash-high'],
      lastActive: 'Ready',
      sessionLimit: {
        label: '5-Hour Session Remaining',
        percentRemaining: 100,
        percentUsed: 0,
        resetCountdown: 'Ready (Idle)',
        resetTimeDisplay: 'Available',
        status: 'normal',
      },
      weeklyLimit: {
        label: 'Weekly Limit Remaining',
        percentRemaining: 96,
        percentUsed: 4,
        resetCountdown: 'Resets in 4d 13h',
        resetTimeDisplay: 'Resets Sun 4:00 AM',
        status: 'normal',
      },
    },
  },
  isLoading: false,
};

export const App: React.FC = () => {
  const [data, setData] = useState<WidgetData | null>(null);
  const [isPinned, setIsPinned] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLockedOpen, setIsLockedOpen] = useState(false);

  const collapseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUsageData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.fetchData();
        setData(result);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 350));
        setData(MOCK_DATA);
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleSetExpanded = useCallback(async (expanded: boolean) => {
    setIsExpanded(expanded);
    if (window.electronAPI) {
      await window.electronAPI.setExpanded(expanded);
    }
  }, []);

  const handleMouseEnter = () => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    if (!isExpanded) {
      handleSetExpanded(true);
    }
  };

  const handleMouseLeave = () => {
    // If user locked it open by clicking, do not auto-collapse on mouse leave
    if (isLockedOpen) return;

    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
    }
    collapseTimeoutRef.current = setTimeout(() => {
      handleSetExpanded(false);
    }, 500);
  };

  const handleExpandClick = () => {
    setIsLockedOpen(true);
    handleSetExpanded(true);
  };

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isPinned().then(setIsPinned);

      const unsubscribe = window.electronAPI.onDataUpdated((updatedData) => {
        setData(updatedData);
      });

      fetchUsageData();

      return () => {
        unsubscribe();
      };
    } else {
      setData(MOCK_DATA);
    }
  }, [fetchUsageData]);

  const handleTogglePin = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (window.electronAPI) {
      const nextState = await window.electronAPI.togglePin();
      setIsPinned(nextState);
    } else {
      setIsPinned((prev) => !prev);
    }
  };

  const handleMinimize = () => {
    setIsLockedOpen(false);
    handleSetExpanded(false);
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  const currentData = data || MOCK_DATA;

  // Render Collapsed Mini-Bar
  if (!isExpanded) {
    return (
      <div
        onMouseEnter={handleMouseEnter}
        className="w-full h-full p-1"
      >
        <CollapsedBar
          data={currentData}
          isPinned={isPinned}
          onTogglePin={handleTogglePin}
          onExpandClick={handleExpandClick}
        />
      </div>
    );
  }

  // Render Expanded Dashboard
  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="flex flex-col h-full w-full bg-[#0D0F17]/95 bg-obsidian-glow text-slate-100 rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden backdrop-blur-2xl transition-all duration-300 ease-out"
    >
      {/* TitleBar in Obsidian Pill Style */}
      <TitleBar
        isPinned={isPinned}
        isRefreshing={isRefreshing}
        onTogglePin={handleTogglePin}
        onRefresh={fetchUsageData}
        onMinimize={handleMinimize}
        onClose={handleClose}
      />

      {/* Main Scrollable Providers List */}
      <main className="flex-1 overflow-y-auto px-3 py-2 space-y-2 custom-scrollbar [-webkit-app-region:no-drag]">
        {/* Error Notice (if any) */}
        {currentData.error && (
          <ErrorMessage message={currentData.error} onRetry={fetchUsageData} />
        )}

        {/* Provider Cards with 2 Quota Bars Each */}
        <div className="space-y-2">
          <ProviderCard quota={currentData.providers.claude} />
          <ProviderCard quota={currentData.providers.codex} />
          <ProviderCard quota={currentData.providers.antigravity} />
        </div>

        {/* Compact Summary Pill in Expanded State */}
        <div className="pt-0.5 pb-1">
          <SummaryPill
            totalActiveTokens={currentData.totalActiveTokens}
            sessionLoadPercent={currentData.sessionLoadPercent}
            activeProvidersCount={currentData.activeProvidersCount}
            lastSyncTimestamp={currentData.lastSyncTimestamp}
            isWatcherActive={currentData.isWatcherActive}
          />
        </div>
      </main>
    </div>
  );
};

export default App;
