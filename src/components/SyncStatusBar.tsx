import React, { useState, useEffect } from 'react';
import { Eye, Radio } from 'lucide-react';

interface SyncStatusBarProps {
  lastSyncTimestamp: number;
  isWatcherActive: boolean;
}

export const SyncStatusBar: React.FC<SyncStatusBarProps> = ({
  lastSyncTimestamp,
  isWatcherActive,
}) => {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const updateDiff = () => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((now - lastSyncTimestamp) / 1000));
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
    const sec = secondsAgo % 60;
    return `${min}m ${sec}s ago`;
  };

  return (
    <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl px-3 py-2 flex items-center justify-between text-[11px] select-none shadow-sm backdrop-blur-md">
      {/* Live Watcher Indicator */}
      <div className="flex items-center gap-1.5 text-slate-300">
        <Radio
          className={`w-3.5 h-3.5 ${
            isWatcherActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
          }`}
        />
        <span className="font-medium text-slate-300">
          {isWatcherActive ? 'Real-time Watcher Active' : 'Polling Active'}
        </span>
      </div>

      {/* Real-time Last Sync counter */}
      <div className="flex items-center gap-1 text-slate-400 font-mono text-[10px]">
        <Eye className="w-3 h-3 text-sky-400" />
        <span>Last Sync:</span>
        <span className="text-sky-300 font-semibold">{formatAgo()}</span>
      </div>
    </div>
  );
};

