import React from 'react';
import { Sparkles, Cpu, Bot, Pin, PinOff, ChevronUp } from 'lucide-react';
import type { WidgetData } from '../types/ccusage';

interface CollapsedBarProps {
  data: WidgetData;
  isPinned: boolean;
  onTogglePin: (e: React.MouseEvent) => void;
  onExpandClick: () => void;
}

export const CollapsedBar: React.FC<CollapsedBarProps> = ({
  data,
  isPinned,
  onTogglePin,
  onExpandClick,
}) => {
  const { claude, codex, antigravity } = data.providers;

  return (
    <div
      onClick={onExpandClick}
      className="flex items-center justify-between h-full px-3.5 bg-[#0D0F17]/95 border border-white/[0.08] rounded-2xl shadow-2xl backdrop-blur-2xl select-none cursor-pointer transition-all duration-300 hover:border-white/[0.15] bg-obsidian-glow"
    >
      {/* 3 Provider Indicators with Subtle Glow Rings */}
      <div className="flex items-center gap-3">
        {/* Claude */}
        <div className="flex items-center gap-1.5" title="Claude Quota Remaining">
          <div className="relative p-1 rounded-full bg-[#161926] border border-amber-500/30">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          </div>
          <span className="font-mono text-xs font-semibold text-slate-200">
            {claude.sessionLimit.percentRemaining}%
          </span>
        </div>

        <span className="text-white/[0.1] text-xs">|</span>

        {/* Codex / GPT */}
        <div className="flex items-center gap-1.5" title="Codex Quota Remaining">
          <div className="relative p-1 rounded-full bg-[#161926] border border-emerald-500/30">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <span className="font-mono text-xs font-semibold text-slate-200">
            {codex.sessionLimit.percentRemaining}%
          </span>
        </div>

        <span className="text-white/[0.1] text-xs">|</span>

        {/* Antigravity / Gemini */}
        <div className="flex items-center gap-1.5" title="Antigravity Quota Remaining">
          <div className="relative p-1 rounded-full bg-[#161926] border border-sky-500/30">
            <Bot className="w-3.5 h-3.5 text-sky-400" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
          </div>
          <span className="font-mono text-xs font-semibold text-slate-200">
            {antigravity.sessionLimit.percentRemaining}%
          </span>
        </div>
      </div>

      {/* Right Controls: Pin & Expand Chevron */}
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        <button
          onClick={onTogglePin}
          title={isPinned ? 'Always on Top (Enabled)' : 'Always on Top (Disabled)'}
          className={`p-1.5 rounded-full transition-colors ${
            isPinned
              ? 'text-indigo-400 bg-indigo-950/40 hover:bg-indigo-900/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
          }`}
        >
          {isPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
        </button>

        <div className="p-1 text-slate-500 hover:text-slate-300">
          <ChevronUp className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
};

