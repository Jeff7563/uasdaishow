import React from 'react';
import { Bot, Sparkles, Cpu, Clock, Calendar } from 'lucide-react';
import type { ProviderQuota, LimitRemaining } from '../types/ccusage';

interface ProviderCardProps {
  quota: ProviderQuota;
}

const PROVIDER_CONFIG = {
  claude: {
    icon: Sparkles,
    badgeColor: 'text-amber-400/90 bg-amber-950/30 border-amber-500/20',
    barGradient: 'from-amber-500/80 to-amber-600/40',
    accentBorder: 'border-white/[0.08] hover:border-amber-500/30',
  },
  codex: {
    icon: Cpu,
    badgeColor: 'text-emerald-400/90 bg-emerald-950/30 border-emerald-500/20',
    barGradient: 'from-emerald-400/80 to-emerald-600/40',
    accentBorder: 'border-white/[0.08] hover:border-emerald-500/30',
  },
  antigravity: {
    icon: Bot,
    badgeColor: 'text-sky-400/90 bg-sky-950/30 border-sky-500/20',
    barGradient: 'from-sky-400/80 to-sky-600/40',
    accentBorder: 'border-white/[0.08] hover:border-sky-500/30',
  },
};

const QuotaBar: React.FC<{
  limit: LimitRemaining;
  icon: typeof Clock;
  gradientClass: string;
}> = ({ limit, icon: SubIcon, gradientClass }) => {
  const isCritical = limit.percentRemaining <= 15;
  const isWarning = limit.percentRemaining > 15 && limit.percentRemaining <= 35;

  const barColor = isCritical
    ? 'bg-gradient-to-r from-rose-500/80 to-red-600/40'
    : isWarning
    ? 'bg-gradient-to-r from-amber-500/80 to-yellow-600/40'
    : `bg-gradient-to-r ${gradientClass}`;

  const percentTextColor = isCritical
    ? 'text-rose-400'
    : isWarning
    ? 'text-amber-400'
    : 'text-slate-200';

  return (
    <div className="space-y-1">
      {/* Label and Remaining % */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-300 font-medium tracking-tight">
          {limit.label}
        </span>
        <div className="flex items-center gap-1 font-mono">
          <span className={`font-semibold ${percentTextColor}`}>
            {limit.percentRemaining}%
          </span>
          <span className="text-[10px] text-slate-500">left</span>
        </div>
      </div>

      {/* Thin Sleek Progress Bar with Dark Track bg-white/[0.06] */}
      <div className="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${Math.max(3, limit.percentRemaining)}%` }}
        />
      </div>

      {/* Subtext under the bar: Reset countdown / date */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-0.5">
        <span className="flex items-center gap-1 truncate text-slate-400">
          <SubIcon className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="truncate">{limit.resetCountdown}</span>
        </span>
        <span className="text-slate-500 shrink-0 text-[9px]">
          ({limit.resetTimeDisplay})
        </span>
      </div>
    </div>
  );
};

export const ProviderCard: React.FC<ProviderCardProps> = ({ quota }) => {
  const config = PROVIDER_CONFIG[quota.id] || PROVIDER_CONFIG.claude;
  const IconComponent = config.icon;

  return (
    <div
      className={`bg-[#121520]/80 border ${config.accentBorder} rounded-2xl p-2.5 space-y-2 transition-all duration-200 shadow-sm backdrop-blur-xl`}
    >
      {/* Provider Header in Segmented Pill Style */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-full border ${config.badgeColor}`}>
            <IconComponent className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200 leading-none">
              {quota.name}
            </div>
            <div className="text-[10px] text-slate-400 leading-none mt-1">
              {quota.subtitle}
            </div>
          </div>
        </div>

        {/* Model Tag Pill */}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#161926] border border-white/[0.06]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
          <span className="text-[10px] font-mono text-slate-300 truncate max-w-[110px]">
            {quota.models[0]?.replace(/^claude-|^gpt-|^gemini-/, '') || 'Active'}
          </span>
        </div>
      </div>

      {/* Two Primary Progress Bars */}
      <div className="space-y-2 pt-1 border-t border-white/[0.04]">
        {/* 1. 5-Hour / Session Limit Remaining */}
        <QuotaBar
          limit={quota.sessionLimit}
          icon={Clock}
          gradientClass={config.barGradient}
        />

        {/* 2. Weekly Limit Remaining */}
        <QuotaBar
          limit={quota.weeklyLimit}
          icon={Calendar}
          gradientClass={config.barGradient}
        />
      </div>
    </div>
  );
};
