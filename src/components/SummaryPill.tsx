import React, { useState, useEffect } from 'react';
import { Layers, Activity, Clock } from 'lucide-react';
import { formatTokens } from '../utils/formatters';

interface SummaryPillProps {
  totalActiveTokens: number;
  sessionLoadPercent: number;
  activeProvidersCount: number;
  lastSyncTimestamp: number;
  isWatcherActive: boolean;
}

export const SummaryPill: React.FC<SummaryPillProps> = ({
  totalActiveTokens,
  sessionLoadPercent,
  activeProvidersCount,
  lastSyncTimestamp,
  isWatcherActive,
}) => {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const updateDiff = () => {
      const diffSec = Math.max(0, Math.floor((Date.now() - lastSyncTimestamp) / 1000));
      setSecondsAgo(diffSec);
    };

    updateDiff();
    const interval = setInterval(updateDiff, 1000);
    return () => clearInterval(interval);
  }, [lastSyncTimestamp]);

  const formatAgo = () => {
    if (secondsAgo < 5) return 'Just now';
    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    const min = Math.floor(secondsAgo / 60);
    return `${min}m ago`;
  };

  return (
    <div className="bg-[#141724]/90 border border-white/[0.08] rounded-2xl p-2 shadow-lg backdrop-blur-xl select-none">
      <div className="grid grid-cols-3 divide-x divide-white/[0.06] text-center">
        {/* Metric 1: Total Active Tokens / Session Load */}
        <div className="px-1.5 flex flex-col items-center justify-center">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
            <Layers className="w-3 h-3 text-indigo-400" />
            <span>Session</span>
          </div>
          <div className="font-mono text-[11px] font-semibold text-slate-200 mt-0.5">
            {totalActiveTokens > 0 ? formatTokens(totalActiveTokens) : `${sessionLoadPercent}%`}
          </div>
        </div>

        {/* Metric 2: Active Rolling Providers */}
        <div className="px-1.5 flex flex-col items-center justify-center">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
            <Activity className="w-3 h-3 text-emerald-400" />
            <span>Active</span>
          </div>
          <div className="font-mono text-[11px] font-semibold text-slate-200 mt-0.5 flex items-center gap-1">
            <span>{activeProvidersCount}/3</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
          </div>
        </div>

        {/* Metric 3: Last Synced Time */}
        <div className="px-1.5 flex flex-col items-center justify-center">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
            <Clock className={`w-3 h-3 ${isWatcherActive ? 'text-sky-400' : 'text-slate-400'}`} />
            <span>Sync</span>
          </div>
          <div className="font-mono text-[11px] font-semibold text-sky-300 mt-0.5">
            {formatAgo()}
          </div>
        </div>
      </div>
    </div>
  );
};

