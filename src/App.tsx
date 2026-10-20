import React, { useEffect, useState, useCallback } from 'react';
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
  burnRateDisplay: 'Idle',
  providers: {
    claude: {
      id: 'claude',
      name: 'Claude',
      subtitle: 'Anthropic Pro/Max',
      models: ['claude-3-7-sonnet'],
      lastActive: 'Active just now',
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
        percentRemaining: 51,
        percentUsed: 49,
        resetCountdown: 'Resets in 4d 8h',
        resetTimeDisplay: 'Resets Sun 4:00 AM',
        status: 'normal',
      },
    },
    codex: {
      id: 'codex',
      name: 'Codex / GPT',
      subtitle: 'OpenAI Plus/Team',
      models: ['gpt-5.6-sol'],
      lastActive: 'Active just now',
      sessionLimit: {
        label: '5-Hour Session Remaining',
        percentRemaining: 100,
        percentUsed: 0,
        resetCountdown: 'Resets in 4h 20m',
        resetTimeDisplay: 'Today 12:17 AM',
        status: 'normal',
      },
      weeklyLimit: {
        label: 'Weekly Limit Remaining',
        percentRemaining: 86,
        percentUsed: 14,
        resetCountdown: 'Resets in 6d 17h',
        resetTimeDisplay: 'Oct 27',
        status: 'normal',
      },
    },
    antigravity: {
      id: 'antigravity',
      name: 'Antigravity',
      subtitle: 'Google Advanced',
      models: ['gemini-3.8-flash'],
      lastActive: 'Active 1m ago',
      sessionLimit: {
        label: 'Five Hour Limit Remaining',
        percentRemaining: 88,
        percentUsed: 12,
        resetCountdown: 'Resets in 4h 30m',
        resetTimeDisplay: 'Today 12:28 AM',
        status: 'normal',
      },
      weeklyLimit: {
        label: 'Weekly Limit Remaining',
        percentRemaining: 8,
        percentUsed: 92,
        resetCountdown: 'Resets in 3d 13h',
        resetTimeDisplay: 'Oct 24',
        status: 'critical',
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
  const [opacity, setOpacity] = useState(1.0);

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

  const handleExpand = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsExpanded(true);
    if (window.electronAPI) {
      await window.electronAPI.setExpanded(true);
    }
  }, []);

  const handleCollapse = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsExpanded(false);
    if (window.electronAPI) {
      await window.electronAPI.setExpanded(false);
    }
  }, []);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isPinned().then(setIsPinned);
      window.electronAPI.getOpacity().then(setOpacity);

      const unsubData = window.electronAPI.onDataUpdated((updatedData) => {
        setData(updatedData);
      });

      const unsubExpand = window.electronAPI.onSetExpandedState((expanded) => {
        setIsExpanded(expanded);
      });

      fetchUsageData();

      return () => {
        unsubData();
        unsubExpand();
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

  const handleToggleOpacity = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Cycle: 1.0 -> 0.8 -> 0.6 -> 1.0
    const nextOpacity = opacity === 1.0 ? 0.8 : opacity === 0.8 ? 0.6 : 1.0;
    setOpacity(nextOpacity);
    if (window.electronAPI) {
      await window.electronAPI.setOpacity(nextOpacity);
    }
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  const currentData = data || MOCK_DATA;

  // Render Collapsed Mini-Bar (Click anywhere on bar or chevron to expand)
  if (!isExpanded) {
    return (
      <div className="w-full h-full p-1">
        <CollapsedBar
          data={currentData}
          isPinned={isPinned}
          onTogglePin={handleTogglePin}
          onExpandClick={handleExpand}
        />
      </div>
    );
  }

  // Render Expanded Dashboard (Click minus in TitleBar to collapse)
  return (
    <div className="w-full h-full p-1">
      <div className="flex flex-col h-full w-full bg-[#0D0F17]/95 bg-obsidian-glow text-slate-100 rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden backdrop-blur-2xl transition-all duration-300 ease-out">
        {/* Draggable TitleBar with Controls */}
        <TitleBar
          isPinned={isPinned}
          isRefreshing={isRefreshing}
          opacity={opacity}
          onTogglePin={handleTogglePin}
          onToggleOpacity={handleToggleOpacity}
          onRefresh={fetchUsageData}
          onMinimize={handleCollapse}
          onClose={handleClose}
        />

        {/* Pinned Top Summary (Session, Active, Sync) - visible immediately without scrolling */}
        <div className="px-3 pt-2 pb-1 no-drag">
          <SummaryPill
            totalActiveTokens={currentData.totalActiveTokens}
            sessionLoadPercent={currentData.sessionLoadPercent}
            activeProvidersCount={currentData.activeProvidersCount}
            lastSyncTimestamp={currentData.lastSyncTimestamp}
            isWatcherActive={currentData.isWatcherActive}
            burnRateDisplay={currentData.burnRateDisplay}
          />
        </div>

        {/* Main Scrollable Providers List */}
        <main className="flex-1 min-h-0 overflow-y-auto px-3 py-1 space-y-2 custom-scrollbar no-drag">
          {/* Error Notice (if any) */}
          {currentData.error && (
            <ErrorMessage message={currentData.error} onRetry={fetchUsageData} />
          )}

          {/* Provider Cards with 2 Quota Bars Each */}
          <div className="space-y-2 pb-1.5">
            <ProviderCard quota={currentData.providers.claude} />
            <ProviderCard quota={currentData.providers.codex} />
            <ProviderCard quota={currentData.providers.antigravity} />
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
