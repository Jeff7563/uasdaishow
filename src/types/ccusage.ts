// --- Raw ccusage CLI JSON Types ---

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface BurnRate {
  costPerHour: number;
  tokensPerMinute: number;
  tokensPerMinuteForIndicator?: number;
}

export interface Projection {
  remainingMinutes: number;
  totalCost: number;
  totalTokens: number;
}

export interface BlockItem {
  id: string;
  startTime: string;
  endTime: string;
  actualEndTime?: string | null;
  isActive: boolean;
  isGap?: boolean;
  entries?: number;
  costUSD?: number;
  totalTokens?: number;
  tokenCounts?: TokenCounts;
  burnRate?: BurnRate | null;
  projection?: Projection | null;
  models?: string[];
}

export interface BlocksOutput {
  blocks: BlockItem[];
}

export interface ModelBreakdown {
  modelName: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface WeeklyItem {
  period: string; // YYYY-MM-DD
  agent: string;
  totalTokens: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  modelsUsed: string[];
  metadata?: {
    agents?: string[];
  };
  modelBreakdowns: ModelBreakdown[];
}

export interface WeeklyOutput {
  weekly: WeeklyItem[];
  totals?: {
    totalTokens: number;
    totalCost: number;
  };
}

// --- Processed Application State Types for Subscription Model ---

export type ProviderId = 'claude' | 'codex' | 'antigravity';

export interface LimitRemaining {
  label: string;
  percentRemaining: number; // 0 - 100%
  percentUsed: number;
  resetCountdown: string;   // e.g. "Resets in 3h 50m"
  resetTimeDisplay: string; // e.g. "Today 18:00" or "Resets Sun 4:00 AM"
  status: 'normal' | 'warning' | 'critical';
}

export interface ProviderQuota {
  id: ProviderId;
  name: string;
  subtitle: string;
  models: string[];
  lastActive: string;
  sessionLimit: LimitRemaining; // 5-Hour / Session Limit Remaining
  weeklyLimit: LimitRemaining;  // Weekly Limit Remaining
}

export interface WidgetData {
  lastUpdated: string;
  lastSyncTimestamp: number;
  isWatcherActive: boolean;
  totalActiveTokens: number;
  sessionLoadPercent: number;
  activeProvidersCount: number;
  providers: {
    claude: ProviderQuota;
    codex: ProviderQuota;
    antigravity: ProviderQuota;
  };
  error?: string | null;
  isLoading: boolean;
}
