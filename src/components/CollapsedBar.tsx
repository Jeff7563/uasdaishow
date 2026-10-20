import React from 'react';
import { Pin, PinOff, ChevronUp, GripVertical } from 'lucide-react';
import { ClaudeIcon, OpenAIIcon, GeminiIcon } from './BrandIcons';
import type { WidgetData, ProviderQuota } from '../types/ccusage';

interface CollapsedBarProps {
  data: WidgetData;
  isPinned: boolean;
  onTogglePin: (e: React.MouseEvent) => void;
  onExpandClick: (e: React.MouseEvent) => void;
}

function getProviderHealth(quota: ProviderQuota) {
  const minPercent = Math.min(
    quota.sessionLimit.percentRemaining,
    quota.weeklyLimit.percentRemaining
  );

  if (minPercent <= 15) {
    return {
      dotColor: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse',
      borderColor: 'border-rose-500/60',
      textColor: 'text-rose-400',
      status: 'critical',
    };
  }
  if (minPercent <= 35) {
    return {
      dotColor: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]',
      borderColor: 'border-amber-500/40',
      textColor: 'text-amber-400',
      status: 'warning',
    };
  }
  return {
    dotColor: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]',
    borderColor: 'border-emerald-500/30',
    textColor: 'text-slate-200',
    status: 'good',
  };
}

export const CollapsedBar: React.FC<CollapsedBarProps> = ({
  data,
  isPinned,
  onTogglePin,
  onExpandClick,
}) => {
  const { claude, codex, antigravity } = data.providers;

  const claudeHealth = getProviderHealth(claude);
  const codexHealth = getProviderHealth(codex);
  const antigravityHealth = getProviderHealth(antigravity);

  return (
    <div
      onDoubleClick={onExpandClick}
      className="flex items-center justify-between h-full px-2.5 bg-[#0D0F17]/95 border border-white/[0.1] rounded-2xl shadow-2xl backdrop-blur-2xl select-none transition-all duration-300 hover:border-white/[0.2] bg-obsidian-glow drag-region cursor-move"
    >
      {/* Left Grip Handle */}
      <div className="flex items-center gap-1.5 shrink-0 text-slate-500 hover:text-slate-300 pr-1">
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* 3 Provider Indicators with Authentic Brand Logos & Dynamic Status Dots */}
      <div
        onClick={onExpandClick}
        className="flex items-center gap-2.5 no-drag cursor-pointer py-1 px-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
        title="Click to expand (Hotkey: Alt+Shift+Q)"
      >
        {/* Claude (Anthropic Terracotta) */}
        <div
          className="flex items-center gap-1.5"
          title={`Claude: Session ${claude.sessionLimit.percentRemaining}% | Weekly ${claude.weeklyLimit.percentRemaining}%`}
        >
          <div className="relative p-1 rounded-full bg-[#161926] border border-[#D97757]/30">
            <ClaudeIcon className="w-3 h-3 text-[#D97757]" />
            <span
              className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${claudeHealth.dotColor}`}
            />
          </div>
          <span className={`font-mono text-xs font-semibold ${claudeHealth.textColor}`}>
            {claude.sessionLimit.percentRemaining}%
          </span>
        </div>

        <span className="text-white/[0.1] text-xs">|</span>

        {/* Codex / GPT (OpenAI Emerald) */}
        <div
          className="flex items-center gap-1.5"
          title={`OpenAI Codex / GPT: Session ${codex.sessionLimit.percentRemaining}% | Weekly ${codex.weeklyLimit.percentRemaining}%`}
        >
          <div className="relative p-1 rounded-full bg-[#161926] border border-[#10A37F]/30">
            <OpenAIIcon className="w-3 h-3 text-[#10A37F]" />
            <span
              className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${codexHealth.dotColor}`}
            />
          </div>
          <span className={`font-mono text-xs font-semibold ${codexHealth.textColor}`}>
            {codex.sessionLimit.percentRemaining}%
          </span>
        </div>

        <span className="text-white/[0.1] text-xs">|</span>

        {/* Antigravity / Gemini (Google Sparkle Blue) */}
        <div
          className="flex items-center gap-1.5"
          title={`Antigravity (Gemini): Session ${antigravity.sessionLimit.percentRemaining}% | Weekly ${antigravity.weeklyLimit.percentRemaining}%`}
        >
          <div className="relative p-1 rounded-full bg-[#161926] border border-[#4E82EE]/30">
            <GeminiIcon className="w-3 h-3 text-[#4E82EE]" />
            <span
              className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${antigravityHealth.dotColor}`}
            />
          </div>
          <span className={`font-mono text-xs font-semibold ${antigravityHealth.textColor}`}>
            {antigravity.sessionLimit.percentRemaining}%
          </span>
        </div>
      </div>

      {/* Right Controls: Pin & Expand Button */}
      <div className="flex items-center gap-1 no-drag shrink-0 pl-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(e);
          }}
          title={isPinned ? 'Always on Top (Enabled)' : 'Always on Top (Disabled)'}
          className={`p-1.5 rounded-full transition-colors ${
            isPinned
              ? 'text-indigo-400 bg-indigo-950/40 hover:bg-indigo-900/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
          }`}
        >
          {isPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
        </button>

        <button
          onClick={onExpandClick}
          title="Expand Details (Alt+Shift+Q)"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
