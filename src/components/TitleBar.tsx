import React from 'react';
import { Pin, PinOff, RefreshCw, Minus, X, Activity } from 'lucide-react';

interface TitleBarProps {
  isPinned: boolean;
  isRefreshing: boolean;
  onTogglePin: () => void;
  onRefresh: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  isPinned,
  isRefreshing,
  onTogglePin,
  onRefresh,
  onMinimize,
  onClose,
}) => {
  return (
    <header className="flex items-center justify-between px-3.5 py-2.5 bg-[#0D0F17]/90 backdrop-blur-2xl border-b border-white/[0.08] select-none [-webkit-app-region:drag]">
      {/* Title & Subtle Glow Radar */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
        </div>
        <span className="text-xs font-semibold tracking-wide text-slate-200">
          AI Quota Monitor
        </span>
      </div>

      {/* Control Buttons in Segmented Pill Style */}
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh Quota Now"
          className="p-1 rounded-full text-slate-400 hover:text-indigo-300 hover:bg-[#161926] border border-transparent hover:border-white/[0.06] transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`}
          />
        </button>

        {/* Pin (Always-on-top) Toggle */}
        <button
          onClick={onTogglePin}
          title={isPinned ? 'Always on Top (Enabled)' : 'Always on Top (Disabled)'}
          className={`p-1 rounded-full border transition-colors ${
            isPinned
              ? 'text-indigo-400 bg-indigo-950/40 border-indigo-500/30'
              : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-[#161926] hover:border-white/[0.06]'
          }`}
        >
          {isPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
        </button>

        {/* Minimize / Collapse */}
        <button
          onClick={onMinimize}
          title="Collapse"
          className="p-1 rounded-full text-slate-400 hover:text-slate-200 hover:bg-[#161926] border border-transparent hover:border-white/[0.06] transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          title="Close Widget"
          className="p-1 rounded-full text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/40 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
