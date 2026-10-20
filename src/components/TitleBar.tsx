import React from 'react';
import { Pin, PinOff, RefreshCw, Minus, X, Activity, GripHorizontal, Eye } from 'lucide-react';

interface TitleBarProps {
  isPinned: boolean;
  isRefreshing: boolean;
  opacity: number;
  onTogglePin: (e: React.MouseEvent) => void;
  onToggleOpacity: (e: React.MouseEvent) => void;
  onRefresh: (e: React.MouseEvent) => void;
  onMinimize: (e: React.MouseEvent) => void;
  onClose: (e: React.MouseEvent) => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  isPinned,
  isRefreshing,
  opacity,
  onTogglePin,
  onToggleOpacity,
  onRefresh,
  onMinimize,
  onClose,
}) => {
  return (
    <header className="flex items-center justify-between px-3 py-2 bg-[#0D0F17]/90 backdrop-blur-2xl border-b border-white/[0.08] select-none drag-region cursor-move">
      {/* Title & Grip */}
      <div className="flex items-center gap-2" title="AI Quota Monitor (Hotkey: Alt+Shift+Q)">
        <GripHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <div className="relative flex items-center justify-center">
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
        </div>
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-xs font-semibold tracking-wide text-slate-200 truncate">
            AI Quota Monitor
          </span>
          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
            Alt+Shift+Q
          </span>
        </div>
      </div>

      {/* Control Buttons (no-drag) */}
      <div className="flex items-center gap-1 no-drag">
        {/* Opacity / Dim Mode Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleOpacity(e);
          }}
          title={`Opacity: ${Math.round(opacity * 100)}% (Click to cycle 100% → 80% → 60%)`}
          className="p-1 rounded-full text-slate-400 hover:text-slate-200 hover:bg-[#161926] border border-transparent hover:border-white/[0.06] transition-colors relative flex items-center justify-center"
        >
          <Eye className="w-3.5 h-3.5" />
          {opacity < 1 && (
            <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-mono font-bold text-indigo-400">
              {Math.round(opacity * 10)}
            </span>
          )}
        </button>

        {/* Refresh Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRefresh(e);
          }}
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
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(e);
          }}
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
          onClick={(e) => {
            e.stopPropagation();
            onMinimize(e);
          }}
          title="Collapse to Mini Bar (Alt+Shift+Q)"
          className="p-1 rounded-full text-slate-400 hover:text-slate-200 hover:bg-[#161926] border border-transparent hover:border-white/[0.06] transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Close */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose(e);
          }}
          title="Close Widget"
          className="p-1 rounded-full text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/40 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
