import React from 'react';
import { Clock, Calendar, ExternalLink } from 'lucide-react';
import { ClaudeIcon, OpenAIIcon, GeminiIcon } from './BrandIcons';
import type { ProviderQuota, LimitRemaining, ProviderId } from '../types/ccusage';

interface ProviderCardProps {
  quota: ProviderQuota;
}

const PROVIDER_CONFIG = {
  claude: {
    icon: ClaudeIcon,
    iconColor: 'text-[#D97757]',
    badgeColor: 'text-[#D97757] bg-[#D97757]/15 border-[#D97757]/30',
    barGradient: 'from-[#D97757] to-[#B8583B]',
    accentBorder: 'border-white/[0.08] hover:border-[#D97757]/40',
  },
  codex: {
    icon: OpenAIIcon,
    iconColor: 'text-[#10A37F]',
    badgeColor: 'text-[#10A37F] bg-[#10A37F]/15 border-[#10A37F]/30',
    barGradient: 'from-[#10A37F] to-[#0A6B53]',
    accentBorder: 'border-white/[0.08] hover:border-[#10A37F]/40',
  },
  antigravity: {
    icon: GeminiIcon,
    iconColor: 'text-[#4E82EE]',
    badgeColor: 'text-[#4E82EE] bg-[#4E82EE]/15 border-[#4E82EE]/30',
    barGradient: 'from-[#4E82EE] via-[#7C3AED] to-[#A855F7]',
    accentBorder: 'border-white/[0.08] hover:border-[#4E82EE]/40',
  },
};

const PROVIDER_URLS: Record<ProviderId, { url: string; tooltip: string }> = {
  claude: {
    url: 'https://claude.ai',
    tooltip: 'Launch Claude in browser (claude.ai)',
  },
  codex: {
    url: 'https://chatgpt.com',
    tooltip: 'Launch ChatGPT in browser (chatgpt.com)',
  },
  antigravity: {
    url: 'https://aistudio.google.com',
    tooltip: 'Launch Google AI Studio in browser (aistudio.google.com)',
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
      {/* Label and Remaining % Display */}
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
  const webConfig = PROVIDER_URLS[quota.id];
  const IconComponent = config.icon;

  const handleOpenWeb = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (webConfig?.url) {
      if (window.electronAPI) {
        window.electronAPI.openExternal(webConfig.url);
      } else {
        window.open(webConfig.url, '_blank');
      }
    }
  };

  return (
    <div
      className={`bg-[#121520]/80 border ${config.accentBorder} rounded-2xl p-2.5 space-y-2 transition-all duration-200 shadow-sm backdrop-blur-xl`}
    >
      {/* Provider Header in Segmented Pill Style */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Authentic Brand Logo Badge */}
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

        {/* Right side: Model Tag Pill & Quick Web Launcher Button */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#161926] border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
            <span className="text-[10px] font-mono text-slate-300 truncate max-w-[95px]">
              {quota.models[0]?.replace(/^claude-|^gpt-|^gemini-/, '') || 'Active'}
            </span>
          </div>

          {/* Quick Web Launcher Button */}
          <button
            onClick={handleOpenWeb}
            title={webConfig?.tooltip || `Open ${quota.name} Web UI`}
            className="p-1 rounded-lg text-slate-500 hover:text-indigo-300 hover:bg-white/[0.08] border border-transparent hover:border-white/[0.08] transition-colors no-drag cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Two Primary Progress Bars */}
      <div className="space-y-2 pt-1 border-t border-white/[0.04]">
        {/* 1. 5-Hour / Session Limit */}
        <QuotaBar
          limit={quota.sessionLimit}
          icon={Clock}
          gradientClass={config.barGradient}
        />

        {/* 2. Weekly Limit */}
        <QuotaBar
          limit={quota.weeklyLimit}
          icon={Calendar}
          gradientClass={config.barGradient}
        />
      </div>
    </div>
  );
};
