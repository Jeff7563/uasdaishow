import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type {
  BlocksOutput,
  WeeklyOutput,
  WidgetData,
  ProviderQuota,
} from '../../src/types/ccusage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

const EXEC_OPTIONS = {
  encoding: 'utf-8' as const,
  maxBuffer: 25 * 1024 * 1024, // 25MB buffer
  timeout: 15000,              // 15s timeout
};

// Subscription standard baseline quotas (Tokens per 5h session and per 7-day week)
const BASELINE_CAPS = {
  claude: {
    session: 50_000_000, // ~50M tokens per 5h window
    weekly: 400_000_000, // ~400M tokens per week
  },
  codex: {
    session: 30_000_000, // ~30M tokens per 5h sliding window
    weekly: 250_000_000, // ~250M tokens per week
  },
  antigravity: {
    session: 50_000_000, // ~50M tokens per 5h sliding window
    weekly: 350_000_000, // ~350M tokens per week
  },
};

export class CcusageService {
  private cachedData: WidgetData | null = null;
  private isFetching = false;
  private ccusageCmd: string | null = null;

  constructor() {
    this.resolveCcusageBinary();
  }

  /**
   * Resolves direct local ccusage binary to avoid slow and cached `npx --yes` lookups.
   */
  private resolveCcusageBinary(): string {
    if (this.ccusageCmd) return this.ccusageCmd;

    const possiblePaths = [
      path.resolve(process.cwd(), 'node_modules/.bin/ccusage.exe'),
      path.resolve(process.cwd(), 'desktop-widget/node_modules/.bin/ccusage.exe'),
      path.resolve(__dirname, '../../node_modules/.bin/ccusage.exe'),
      path.resolve(__dirname, '../../../node_modules/.bin/ccusage.exe'),
      path.resolve(process.cwd(), 'apps/ccusage/src/cli.js'),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        this.ccusageCmd = p.endsWith('.js') ? `node "${p}"` : `"${p}"`;
        return this.ccusageCmd;
      }
    }

    // Fallback to bunx or ccusage if executable not located in standard node_modules
    this.ccusageCmd = 'bun x --no-install ccusage';
    return this.ccusageCmd;
  }

  public clearCache(): void {
    this.cachedData = null;
  }

  public async fetchUsage(forceRefresh = false): Promise<WidgetData> {
    if (forceRefresh) {
      this.clearCache();
    }

    if (this.isFetching && this.cachedData) {
      return this.cachedData;
    }

    this.isFetching = true;

    try {
      const cmd = this.resolveCcusageBinary();
      let blocksData: BlocksOutput | null = null;
      let weeklyData: WeeklyOutput | null = null;
      let errorMessage: string | null = null;

      // 1. Fetch blocks report (fast local binary ~30ms)
      try {
        const { stdout } = await execAsync(`${cmd} blocks --json`, EXEC_OPTIONS);
        blocksData = JSON.parse(stdout.trim()) as BlocksOutput;
      } catch (err: any) {
        console.warn('[CcusageService] blocks command error:', err.message);
        errorMessage = 'Blocks CLI warning: ' + (err.message || 'Error');
      }

      // 2. Fetch weekly report (fast local binary ~40ms)
      try {
        const { stdout } = await execAsync(`${cmd} weekly --json`, EXEC_OPTIONS);
        weeklyData = JSON.parse(stdout.trim()) as WeeklyOutput;
      } catch (err: any) {
        console.warn('[CcusageService] weekly command error:', err.message);
        if (errorMessage) {
          errorMessage += ' | Weekly CLI warning: ' + err.message;
        } else {
          errorMessage = 'Weekly CLI warning: ' + err.message;
        }
      }

      // 3. Inspect local file directories for exact real-time activity timestamps
      const localActivity = this.detectLocalTimestamps();

      const widgetData = this.buildSubscriptionQuotaData(
        blocksData,
        weeklyData,
        localActivity,
        errorMessage
      );

      this.cachedData = widgetData;
      return widgetData;
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Directly inspects local log / state files in Windows user profile
   */
  private detectLocalTimestamps() {
    const userProfile = os.homedir();

    const checkMtime = (subPath: string): number => {
      try {
        const full = path.join(userProfile, subPath);
        if (fs.existsSync(full)) {
          const stat = fs.statSync(full);
          return stat.mtimeMs;
        }
      } catch {
        // ignore
      }
      return 0;
    };

    // Claude: check history.jsonl and sessions directory
    const claudeTime = Math.max(
      checkMtime('.claude/history.jsonl'),
      checkMtime('.claude/sessions'),
      checkMtime('.claude.json')
    );

    // Codex: check session_index.jsonl and sqlite wal
    const codexTime = Math.max(
      checkMtime('.codex/session_index.jsonl'),
      checkMtime('.codex/logs_2.sqlite-wal'),
      checkMtime('.codex/logs_2.sqlite')
    );

    // Antigravity: check brain, conversations, and history
    const antigravityTime = Math.max(
      checkMtime('.gemini/antigravity/conversations'),
      checkMtime('.gemini/antigravity/brain'),
      checkMtime('.gemini/history')
    );

    return { claudeTime, codexTime, antigravityTime };
  }

  /**
   * Computes countdown string e.g. "Resets in 3h 50m"
   */
  private formatRemainingCountdown(diffMs: number): string {
    if (diffMs <= 0) return 'Resets in 0m';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `Resets in ${hours}h ${minutes}m`;
    }
    return `Resets in ${minutes}m`;
  }

  /**
   * Computes weekly reset string e.g. "Resets Sun 4:00 AM (in 4d 13h)"
   */
  private getWeeklyResetInfo(): { text: string; countdown: string } {
    const now = new Date();
    // Claude & OpenAI weekly quotas typically reset on Sunday night / Monday 00:00 UTC
    // Calculate next Sunday 4:00 AM local
    const resetDate = new Date();
    const day = now.getDay(); // 0 is Sunday
    const daysUntilNextSunday = (7 - day) % 7 || 7;
    resetDate.setDate(now.getDate() + daysUntilNextSunday);
    resetDate.setHours(4, 0, 0, 0);

    const diffMs = Math.max(0, resetDate.getTime() - now.getTime());
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    const countdown = days > 0 ? `Resets in ${days}d ${hours}h` : `Resets in ${hours}h`;
    const text = 'Resets Sun 4:00 AM';

    return { text, countdown };
  }

  private buildSubscriptionQuotaData(
    blocksData: BlocksOutput | null,
    weeklyData: WeeklyOutput | null,
    localActivity: { claudeTime: number; codexTime: number; antigravityTime: number },
    error: string | null
  ): WidgetData {
    const now = Date.now();
    const weeklyReset = this.getWeeklyResetInfo();

    // 1. Weekly Token Sums by Provider from latest weekly report
    let claudeWeeklyTokens = 0;
    let codexWeeklyTokens = 0;
    let antigravityWeeklyTokens = 0;

    let claudeModels: string[] = [];
    let codexModels: string[] = [];
    let antigravityModels: string[] = [];

    if (weeklyData?.weekly && weeklyData.weekly.length > 0) {
      const currentWeek = weeklyData.weekly[weeklyData.weekly.length - 1];
      if (currentWeek.modelBreakdowns) {
        for (const item of currentWeek.modelBreakdowns) {
          const nameLower = item.modelName.toLowerCase();
          const tokens =
            (item.inputTokens || 0) +
            (item.outputTokens || 0) +
            (item.cacheReadTokens || 0) +
            (item.cacheCreationTokens || 0);

          if (nameLower.includes('claude')) {
            claudeWeeklyTokens += tokens;
            if (!claudeModels.includes(item.modelName)) claudeModels.push(item.modelName);
          } else if (
            nameLower.includes('gpt') ||
            nameLower.includes('codex') ||
            nameLower.includes('o1') ||
            nameLower.includes('o3')
          ) {
            codexWeeklyTokens += tokens;
            if (!codexModels.includes(item.modelName)) codexModels.push(item.modelName);
          } else if (
            nameLower.includes('gemini') ||
            nameLower.includes('antigravity')
          ) {
            antigravityWeeklyTokens += tokens;
            if (!antigravityModels.includes(item.modelName)) antigravityModels.push(item.modelName);
          }
        }
      }
    }

    // Helper for status tier
    const getStatus = (remaining: number): 'normal' | 'warning' | 'critical' => {
      if (remaining <= 15) return 'critical';
      if (remaining <= 35) return 'warning';
      return 'normal';
    };

    // Helper to format relative time e.g. "Active 2m ago"
    const getRelativeActive = (timestamp: number): string => {
      if (!timestamp) return 'Idle';
      const diffMin = Math.floor((now - timestamp) / 60000);
      if (diffMin < 1) return 'Active just now';
      if (diffMin < 60) return `Active ${diffMin}m ago`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `Active ${diffHours}h ago`;
      return 'Idle';
    };

    // --- 1. CLAUDE ---
    let claudeSessionRemaining = 85;
    let claudeSessionCountdown = 'Resets in 3h 50m';
    let claudeSessionTime = 'Today 18:00';

    if (blocksData?.blocks && blocksData.blocks.length > 0) {
      const activeBlock =
        blocksData.blocks.find((b) => b.isActive) ||
        [...blocksData.blocks].reverse().find((b) => !b.isGap) ||
        blocksData.blocks[blocksData.blocks.length - 1];

      if (activeBlock) {
        const blockEnd = new Date(activeBlock.endTime).getTime();
        const diffMs = Math.max(0, blockEnd - now);
        claudeSessionCountdown = this.formatRemainingCountdown(diffMs);
        claudeSessionTime = new Date(activeBlock.endTime).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        const sessionTokens = activeBlock.totalTokens || 0;
        const usedPercent = Math.min(95, Math.round((sessionTokens / BASELINE_CAPS.claude.session) * 100));
        claudeSessionRemaining = Math.max(5, 100 - usedPercent);
      }
    }

    const claudeWeeklyUsed = Math.min(95, Math.round((claudeWeeklyTokens / BASELINE_CAPS.claude.weekly) * 100));
    const claudeWeeklyRemaining = Math.max(5, 100 - claudeWeeklyUsed);

    const claudeQuota: ProviderQuota = {
      id: 'claude',
      name: 'Claude',
      subtitle: 'Anthropic Pro/Max',
      models: claudeModels.length > 0 ? claudeModels : ['claude-opus-5-5'],
      lastActive: getRelativeActive(localActivity.claudeTime),
      sessionLimit: {
        label: '5-Hour Session Remaining',
        percentRemaining: claudeSessionRemaining,
        percentUsed: 100 - claudeSessionRemaining,
        resetCountdown: claudeSessionCountdown,
        resetTimeDisplay: claudeSessionTime,
        status: getStatus(claudeSessionRemaining),
      },
      weeklyLimit: {
        label: 'Weekly Limit Remaining',
        percentRemaining: claudeWeeklyRemaining,
        percentUsed: 100 - claudeWeeklyRemaining,
        resetCountdown: weeklyReset.countdown,
        resetTimeDisplay: weeklyReset.text,
        status: getStatus(claudeWeeklyRemaining),
      },
    };

    // --- 2. CODEX (GPT / OpenAI) ---
    // Sliding 5h window from last activity
    let codexSessionRemaining = 100;
    let codexSessionCountdown = 'Ready (Idle)';
    let codexSessionTime = 'Available';

    if (localActivity.codexTime > 0) {
      const elapsedSinceActive = now - localActivity.codexTime;
      const window5h = 5 * 60 * 60 * 1000;

      if (elapsedSinceActive < window5h) {
        const remainingWindow = window5h - elapsedSinceActive;
        codexSessionCountdown = this.formatRemainingCountdown(remainingWindow);
        const resetTime = new Date(now + remainingWindow);
        codexSessionTime = resetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        // Estimate sliding usage
        codexSessionRemaining = Math.max(20, Math.round(100 - (1 - elapsedSinceActive / window5h) * 45));
      }
    }

    const codexWeeklyUsed = Math.min(95, Math.round((codexWeeklyTokens / BASELINE_CAPS.codex.weekly) * 100));
    const codexWeeklyRemaining = Math.max(5, 100 - codexWeeklyUsed);

    const codexQuota: ProviderQuota = {
      id: 'codex',
      name: 'Codex / GPT',
      subtitle: 'OpenAI Plus/Team',
      models: codexModels.length > 0 ? codexModels : ['gpt-5.6-sol'],
      lastActive: getRelativeActive(localActivity.codexTime),
      sessionLimit: {
        label: '5-Hour Session Remaining',
        percentRemaining: codexSessionRemaining,
        percentUsed: 100 - codexSessionRemaining,
        resetCountdown: codexSessionCountdown,
        resetTimeDisplay: codexSessionTime,
        status: getStatus(codexSessionRemaining),
      },
      weeklyLimit: {
        label: 'Weekly Limit Remaining',
        percentRemaining: codexWeeklyRemaining,
        percentUsed: 100 - codexWeeklyRemaining,
        resetCountdown: weeklyReset.countdown,
        resetTimeDisplay: weeklyReset.text,
        status: getStatus(codexWeeklyRemaining),
      },
    };

    // --- 3. ANTIGRAVITY (Google Gemini) ---
    let antigravitySessionRemaining = 100;
    let antigravitySessionCountdown = 'Ready (Idle)';
    let antigravitySessionTime = 'Available';

    if (localActivity.antigravityTime > 0) {
      const elapsedSinceActive = now - localActivity.antigravityTime;
      const window5h = 5 * 60 * 60 * 1000;

      if (elapsedSinceActive < window5h) {
        const remainingWindow = window5h - elapsedSinceActive;
        antigravitySessionCountdown = this.formatRemainingCountdown(remainingWindow);
        const resetTime = new Date(now + remainingWindow);
        antigravitySessionTime = resetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        antigravitySessionRemaining = Math.max(30, Math.round(100 - (1 - elapsedSinceActive / window5h) * 35));
      }
    }

    const antigravityWeeklyUsed = Math.min(95, Math.round((antigravityWeeklyTokens / BASELINE_CAPS.antigravity.weekly) * 100));
    const antigravityWeeklyRemaining = Math.max(5, 100 - antigravityWeeklyUsed);

    const antigravityQuota: ProviderQuota = {
      id: 'antigravity',
      name: 'Antigravity',
      subtitle: 'Google Advanced',
      models: antigravityModels.length > 0 ? antigravityModels : ['gemini-3.8-flash-high'],
      lastActive: getRelativeActive(localActivity.antigravityTime),
      sessionLimit: {
        label: '5-Hour Session Remaining',
        percentRemaining: antigravitySessionRemaining,
        percentUsed: 100 - antigravitySessionRemaining,
        resetCountdown: antigravitySessionCountdown,
        resetTimeDisplay: antigravitySessionTime,
        status: getStatus(antigravitySessionRemaining),
      },
      weeklyLimit: {
        label: 'Weekly Limit Remaining',
        percentRemaining: antigravityWeeklyRemaining,
        percentUsed: 100 - antigravityWeeklyRemaining,
        resetCountdown: weeklyReset.countdown,
        resetTimeDisplay: weeklyReset.text,
        status: getStatus(antigravityWeeklyRemaining),
      },
    };

    // Total active tokens in rolling session
    let totalActiveTokens = 0;
    if (blocksData?.blocks) {
      const activeBlock =
        blocksData.blocks.find((b) => b.isActive) ||
        [...blocksData.blocks].reverse().find((b) => !b.isGap);
      if (activeBlock) {
        totalActiveTokens = activeBlock.totalTokens || 0;
      }
    }

    const avgLoadPercent = Math.round(
      (claudeQuota.sessionLimit.percentUsed +
        codexQuota.sessionLimit.percentUsed +
        antigravityQuota.sessionLimit.percentUsed) / 3
    );

    return {
      lastUpdated: new Date().toLocaleTimeString(),
      lastSyncTimestamp: now,
      isWatcherActive: true,
      totalActiveTokens,
      sessionLoadPercent: avgLoadPercent,
      activeProvidersCount: 3,
      providers: {
        claude: claudeQuota,
        codex: codexQuota,
        antigravity: antigravityQuota,
      },
      error: error || null,
      isLoading: false,
    };
  }
}
