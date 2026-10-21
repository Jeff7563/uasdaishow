import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type {
  BlocksOutput,
  BlockItem,
  WeeklyOutput,
  WidgetData,
  ProviderQuota,
  LimitRemaining,
} from '../../src/types/ccusage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

const EXEC_OPTIONS = {
  encoding: 'utf-8' as const,
  maxBuffer: 25 * 1024 * 1024,
  timeout: 25000,
};

function getStatusTier(remaining: number): 'normal' | 'warning' | 'critical' {
  if (remaining <= 15) return 'critical';
  if (remaining <= 35) return 'warning';
  return 'normal';
}

function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) return 'Resets in 0m';
  const totalMins = Math.floor(diffMs / 60000);
  if (totalMins < 60) {
    return totalMins <= 0 ? 'Resets in <1m' : `Resets in ${totalMins}m`;
  }
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours < 24) {
    return mins > 0 ? `Resets in ${hours}h ${mins}m` : `Resets in ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `Resets in ${days}d ${remHours}h` : `Resets in ${days}d`;
}

function formatResetTimeDisplay(date: Date): string {
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return `Today ${timeStr}`;
  }

  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `Resets ${dayName} ${timeStr}`;
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getNextSunday4AM(): Date {
  const d = new Date();
  const day = d.getDay(); // 0 is Sunday
  const daysUntilSunday = (7 - day) % 7;
  const target = new Date(d);
  target.setDate(d.getDate() + daysUntilSunday);
  target.setHours(4, 0, 0, 0);
  if (target.getTime() <= d.getTime()) {
    target.setDate(target.getDate() + 7);
  }
  return target;
}

export class CcusageService {
  private cachedData: WidgetData | null = null;
  private isFetching = false;
  private ccusageCmd: string | null = null;

  // Cloud API in-memory caching to prevent 429 Rate Limits
  private cachedCodexQuota: Partial<ProviderQuota> | null = null;
  private lastCodexFetch = 0;

  private cachedClaudeQuota: Partial<ProviderQuota> | null = null;
  private lastClaudeFetch = 0;

  private cachedAntigravityQuota: Partial<ProviderQuota> | null = null;
  private lastAntigravityFetch = 0;

  // Cached CLI weekly data to avoid heavy multi-month JSON parsing on every 20s poll
  private cachedWeeklyResult: {
    weeklyModels: { claude?: string[]; codex?: string[]; antigravity?: string[] };
    claudeWeeklyCost: number;
    claudeWeeklyTokens: number;
  } | null = null;
  private lastWeeklyFetch = 0;

  private lastTokenRecord: { tokens: number; timestamp: number } | null = null;

  constructor() {
    this.resolveCcusageBinary();
  }

  private resolveCcusageBinary(): string {
    if (this.ccusageCmd) return this.ccusageCmd;

    const resourcesDir = (process as any).resourcesPath || '';
    const possiblePaths = [
      path.resolve(process.cwd(), 'desktop-widget/node_modules/.bin/ccusage.exe'),
      path.resolve(process.cwd(), 'node_modules/.bin/ccusage.exe'),
      path.resolve(__dirname, '../../node_modules/.bin/ccusage.exe'),
      path.resolve(__dirname, '../../../node_modules/.bin/ccusage.exe'),
      path.resolve(process.cwd(), 'node_modules/ccusage/src/cli.js'),
      path.join(__dirname, '../../node_modules/ccusage/src/cli.js'),
      path.join(__dirname, '../node_modules/ccusage/src/cli.js'),
      path.join(resourcesDir, 'app.asar.unpacked/node_modules/ccusage/src/cli.js'),
      path.join(resourcesDir, 'node_modules/ccusage/src/cli.js'),
      path.resolve(process.cwd(), 'apps/ccusage/src/cli.js'),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        this.ccusageCmd = p.endsWith('.js') ? `node "${p}"` : `"${p}"`;
        return this.ccusageCmd;
      }
    }

    this.ccusageCmd = 'npx --no-install ccusage';
    return this.ccusageCmd;
  }

  public clearCache(): void {
    this.cachedData = null;
    this.lastCodexFetch = 0;
    this.lastClaudeFetch = 0;
    this.lastAntigravityFetch = 0;
    this.lastWeeklyFetch = 0;
    this.cachedWeeklyResult = null;
  }

  /**
   * 1. Live Fetch: OpenAI Codex / ChatGPT Plus Quota
   * Calls https://chatgpt.com/backend-api/wham/usage
   */
  private async fetchCodexQuotaLive(forceRefresh = false): Promise<Partial<ProviderQuota> | null> {
    const now = Date.now();
    if (!forceRefresh && this.cachedCodexQuota && now - this.lastCodexFetch < 25000) {
      return this.cachedCodexQuota;
    }

    try {
      const authPath = path.join(os.homedir(), '.codex', 'auth.json');
      if (!fs.existsSync(authPath)) return this.cachedCodexQuota;

      const authContent = JSON.parse(await fs.promises.readFile(authPath, 'utf8'));
      const token = authContent?.tokens?.access_token;
      if (!token) return this.cachedCodexQuota;

      const res = await fetch('https://chatgpt.com/backend-api/wham/usage', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'OAI-App-Brand': 'chatgpt',
          'x-openai-codex-pricing-chooser': '1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn('[CcusageService] Codex API responded with status 429, using cached quota');
          return this.cachedCodexQuota;
        }
        console.warn(`[CcusageService] Codex API responded with status ${res.status}`);
        return this.cachedCodexQuota;
      }

      const json = await res.json() as any;
      const rateLimit = json?.rate_limit;
      if (!rateLimit) return this.cachedCodexQuota;

      const primary = rateLimit.primary_window;
      const secondary = rateLimit.secondary_window;

      // 5-Hour Primary Window
      const primaryUsed = primary?.used_percent ?? 0;
      const primaryRemaining = Math.max(0, 100 - primaryUsed);
      const primaryResetMs = primary?.reset_at ? primary.reset_at * 1000 : now;
      const primaryDiffMs = Math.max(0, primaryResetMs - now);

      const sessionLimit: LimitRemaining = {
        label: '5-Hour Session Remaining',
        percentRemaining: primaryRemaining,
        percentUsed: primaryUsed,
        resetCountdown: primaryDiffMs > 0 ? formatCountdown(primaryDiffMs) : 'Ready (Idle)',
        resetTimeDisplay: primary?.reset_at ? formatResetTimeDisplay(new Date(primaryResetMs)) : 'Available',
        status: getStatusTier(primaryRemaining),
      };

      // Weekly Secondary Window
      const secondaryUsed = secondary?.used_percent ?? 0;
      const secondaryRemaining = Math.max(0, 100 - secondaryUsed);
      const secondaryResetMs = secondary?.reset_at ? secondary.reset_at * 1000 : now;
      const secondaryDiffMs = Math.max(0, secondaryResetMs - now);

      const weeklyLimit: LimitRemaining = {
        label: 'Weekly Limit Remaining',
        percentRemaining: secondaryRemaining,
        percentUsed: secondaryUsed,
        resetCountdown: secondaryDiffMs > 0 ? formatCountdown(secondaryDiffMs) : 'Ready (Idle)',
        resetTimeDisplay: secondary?.reset_at ? formatResetTimeDisplay(new Date(secondaryResetMs)) : 'Available',
        status: getStatusTier(secondaryRemaining),
      };

      const detectedModels = json?.model_usage ? Object.keys(json.model_usage) : ['gpt-5.6-sol'];

      this.cachedCodexQuota = {
        sessionLimit,
        weeklyLimit,
        models: detectedModels.length > 0 ? detectedModels : ['gpt-5.6-sol'],
      };
      this.lastCodexFetch = now;
      return this.cachedCodexQuota;
    } catch (err: any) {
      console.warn('[CcusageService] fetchCodexQuotaLive error:', err.message);
      return this.cachedCodexQuota;
    }
  }

  /**
   * 2. Live Fetch: Claude Pro/Team Quota
   * Calls https://api.anthropic.com/api/oauth/usage (with auto-refresh when expired)
   */
  private async fetchClaudeQuotaLive(forceRefresh = false): Promise<Partial<ProviderQuota> | null> {
    const now = Date.now();
    if (!forceRefresh && this.cachedClaudeQuota && now - this.lastClaudeFetch < 25000) {
      return this.cachedClaudeQuota;
    }

    try {
      const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
      if (!fs.existsSync(credPath)) return this.cachedClaudeQuota;

      const credContent = JSON.parse(await fs.promises.readFile(credPath, 'utf8'));
      let token = credContent?.claudeAiOauth?.accessToken;
      const refreshToken = credContent?.claudeAiOauth?.refreshToken;
      const expiresAt = credContent?.claudeAiOauth?.expiresAt ?? 0;

      // If token expired, attempt OAuth refresh via official Claude Code client
      if (refreshToken && now >= expiresAt - 60000) {
        try {
          const refreshRes = await fetch('https://platform.claude.com/v1/oauth/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'claude-code/2.1.304',
            },
            body: JSON.stringify({
              grant_type: 'refresh_token',
              refresh_token: refreshToken,
              client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
              scope: Array.isArray(credContent?.claudeAiOauth?.scopes)
                ? credContent.claudeAiOauth.scopes.join(' ')
                : 'user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload user:plugins',
            }),
            signal: AbortSignal.timeout(6000),
          });

          if (refreshRes.ok) {
            const refreshData = (await refreshRes.json()) as any;
            if (refreshData?.access_token) {
              token = refreshData.access_token;
              credContent.claudeAiOauth.accessToken = refreshData.access_token;
              if (refreshData.refresh_token) {
                credContent.claudeAiOauth.refreshToken = refreshData.refresh_token;
              }
              credContent.claudeAiOauth.expiresAt = Date.now() + (refreshData.expires_in ?? 3600) * 1000;
              await fs.promises.writeFile(credPath, JSON.stringify(credContent, null, 2), 'utf8');
              console.log('[CcusageService] Claude OAuth token refreshed successfully');
            }
          }
        } catch (refreshErr: any) {
          console.warn('[CcusageService] Claude token refresh error:', refreshErr.message);
        }
      }

      if (!token) return this.cachedClaudeQuota;

      const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'claude-code/2.1.304',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn('[CcusageService] Claude API responded with status 429, using fallback calculation');
          return this.cachedClaudeQuota;
        }
        console.warn(`[CcusageService] Claude API responded with status ${res.status}`);
        return this.cachedClaudeQuota;
      }

      const json = await res.json() as any;
      const fiveHour = json?.five_hour;
      const sevenDay = json?.seven_day;

      // Session Limit (5-Hour Window)
      const sessionUsed = Math.min(100, Math.max(0, Math.round(fiveHour?.utilization ?? 0)));
      const sessionRemaining = 100 - sessionUsed;
      const sessionResetDate = fiveHour?.resets_at ? new Date(fiveHour.resets_at) : null;
      const sessionDiffMs = sessionResetDate ? Math.max(0, sessionResetDate.getTime() - now) : 0;

      const sessionLimit: LimitRemaining = {
        label: '5-Hour Session Remaining',
        percentRemaining: sessionRemaining,
        percentUsed: sessionUsed,
        resetCountdown: sessionDiffMs > 0 ? formatCountdown(sessionDiffMs) : 'Ready (Idle)',
        resetTimeDisplay: sessionResetDate ? formatResetTimeDisplay(sessionResetDate) : 'Available',
        status: getStatusTier(sessionRemaining),
      };

      // Weekly Limit (7-Day Window)
      const weeklyUsed = Math.min(100, Math.max(0, Math.round(sevenDay?.utilization ?? 0)));
      const weeklyRemaining = 100 - weeklyUsed;
      const weeklyResetDate = sevenDay?.resets_at ? new Date(sevenDay.resets_at) : null;
      const weeklyDiffMs = weeklyResetDate ? Math.max(0, weeklyResetDate.getTime() - now) : 0;

      const weeklyLimit: LimitRemaining = {
        label: 'Weekly Limit Remaining',
        percentRemaining: weeklyRemaining,
        percentUsed: weeklyUsed,
        resetCountdown: weeklyDiffMs > 0 ? formatCountdown(weeklyDiffMs) : 'Ready (Idle)',
        resetTimeDisplay: weeklyResetDate ? formatResetTimeDisplay(weeklyResetDate) : 'Resets Sun 4:00 AM',
        status: getStatusTier(weeklyRemaining),
      };

      this.cachedClaudeQuota = {
        sessionLimit,
        weeklyLimit,
      };
      this.lastClaudeFetch = now;
      return this.cachedClaudeQuota;
    } catch (err: any) {
      console.warn('[CcusageService] fetchClaudeQuotaLive error:', err.message);
      return this.cachedClaudeQuota;
    }
  }

  /**
   * 3. Live Fetch: Google Antigravity Quota
   * Queries local Language Server Connect-RPC: RetrieveUserQuotaSummary & GetUserStatus
   */
  private async fetchAntigravityQuotaLive(forceRefresh = false): Promise<Partial<ProviderQuota> | null> {
    const now = Date.now();
    if (!forceRefresh && this.cachedAntigravityQuota && now - this.lastAntigravityFetch < 10000) {
      return this.cachedAntigravityQuota;
    }

    try {
      const logDir = path.join(os.homedir(), '.gemini', 'antigravity', 'log');
      if (!fs.existsSync(logDir)) return this.cachedAntigravityQuota;

      const logFiles = (await fs.promises.readdir(logDir))
        .filter((f) => f.startsWith('cli-') && f.endsWith('.log'))
        .map((f) => ({
          name: f,
          mtime: fs.statSync(path.join(logDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      if (logFiles.length === 0) return this.cachedAntigravityQuota;

      const latestLog = await fs.promises.readFile(path.join(logDir, logFiles[0].name), 'utf8');
      const portMatch = /listening on random port at (\d+) for HTTP\b/i.exec(latestLog);
      if (!portMatch) return this.cachedAntigravityQuota;
      const port = parseInt(portMatch[1], 10);

      // Disable TLS verification for local language server loopback
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

      // Fetch HTML to extract active CSRF token via HTTPS
      const htmlRes = await fetch(`https://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!htmlRes.ok) return this.cachedAntigravityQuota;

      const html = await htmlRes.text();
      const tokenMatch = /"csrfToken"\s*:\s*"([^"]+)"/.exec(html);
      if (!tokenMatch) return this.cachedAntigravityQuota;
      const csrfToken = tokenMatch[1];

      // Call RetrieveUserQuotaSummary via Connect-RPC over HTTPS
      const quotaRes = await fetch(
        `https://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Connect-Protocol-Version': '1',
            'X-Codeium-Csrf-Token': csrfToken,
          },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(4000),
        }
      );

      if (!quotaRes.ok) return this.cachedAntigravityQuota;
      const quotaJson = await quotaRes.json() as any;

      const groups = quotaJson?.response?.groups || [];
      const geminiGroup = groups.find((g: any) => g.displayName?.includes('Gemini'));
      const buckets = geminiGroup?.buckets || [];

      const weeklyBucket = buckets.find((b: any) => b.bucketId === 'gemini-weekly' || b.window === 'weekly');
      const sessionBucket = buckets.find((b: any) => b.bucketId === 'gemini-5h' || b.window === '5h');

      // 5-Hour Session Window
      let sessionLimit: LimitRemaining;
      if (sessionBucket) {
        const remainingFraction = sessionBucket.remainingFraction ?? 1;
        const percentRemaining = Math.max(0, Math.min(100, Math.round(remainingFraction * 100)));
        const resetDate = sessionBucket.resetTime ? new Date(sessionBucket.resetTime) : null;
        const diffMs = resetDate ? Math.max(0, resetDate.getTime() - now) : 0;

        sessionLimit = {
          label: 'Five Hour Limit Remaining',
          percentRemaining,
          percentUsed: 100 - percentRemaining,
          resetCountdown: diffMs > 0 ? formatCountdown(diffMs) : 'Ready (Idle)',
          resetTimeDisplay: resetDate ? formatResetTimeDisplay(resetDate) : 'Available',
          status: getStatusTier(percentRemaining),
        };
      } else {
        sessionLimit = {
          label: 'Five Hour Limit Remaining',
          percentRemaining: 100,
          percentUsed: 0,
          resetCountdown: 'Ready (Idle)',
          resetTimeDisplay: 'Available',
          status: 'normal',
        };
      }

      // Weekly Window
      let weeklyLimit: LimitRemaining;
      if (weeklyBucket) {
        const remainingFraction = weeklyBucket.remainingFraction ?? 1;
        const percentRemaining = Math.max(0, Math.min(100, Math.round(remainingFraction * 100)));
        const resetDate = weeklyBucket.resetTime ? new Date(weeklyBucket.resetTime) : null;
        const diffMs = resetDate ? Math.max(0, resetDate.getTime() - now) : 0;

        weeklyLimit = {
          label: 'Weekly Limit Remaining',
          percentRemaining,
          percentUsed: 100 - percentRemaining,
          resetCountdown: diffMs > 0 ? formatCountdown(diffMs) : 'Ready (Idle)',
          resetTimeDisplay: resetDate ? formatResetTimeDisplay(resetDate) : 'Available',
          status: getStatusTier(percentRemaining),
        };
      } else {
        weeklyLimit = {
          label: 'Weekly Limit Remaining',
          percentRemaining: 100,
          percentUsed: 0,
          resetCountdown: 'Ready (Idle)',
          resetTimeDisplay: 'Available',
          status: 'normal',
        };
      }

      // Model info from GetUserStatus
      let models = ['gemini-3.8-flash'];
      try {
        const statusRes = await fetch(
          `https://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/GetUserStatus`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Connect-Protocol-Version': '1',
              'X-Codeium-Csrf-Token': csrfToken,
            },
            body: JSON.stringify({}),
            signal: AbortSignal.timeout(3000),
          }
        );
        if (statusRes.ok) {
          const statusJson = await statusRes.json() as any;
          const configs = statusJson?.userStatus?.cascadeModelConfigData?.clientModelConfigs;
          if (Array.isArray(configs) && configs.length > 0 && configs[0].label) {
            models = [configs[0].label.replace(/\s*\(Low\)|\s*\(High\)/gi, '')];
          }
        }
      } catch {
        // non-fatal
      }

      this.cachedAntigravityQuota = {
        sessionLimit,
        weeklyLimit,
        models,
      };
      this.lastAntigravityFetch = now;
      return this.cachedAntigravityQuota;
    } catch (err: any) {
      console.warn('[CcusageService] fetchAntigravityQuotaLive error:', err.message);
      return this.cachedAntigravityQuota;
    }
  }

  /**
   * Inspects local directory mtimes to indicate recent activity
   */
  private detectLocalTimestamps() {
    const userProfile = os.homedir();

    const checkMtime = (subPath: string): number => {
      try {
        const full = path.join(userProfile, subPath);
        if (fs.existsSync(full)) {
          return fs.statSync(full).mtimeMs;
        }
      } catch {
        // ignore
      }
      return 0;
    };

    const claudeTime = Math.max(
      checkMtime('.claude/history.jsonl'),
      checkMtime('.claude/sessions'),
      checkMtime('.claude.json')
    );

    const codexTime = Math.max(
      checkMtime('.codex/session_index.jsonl'),
      checkMtime('.codex/logs_2.sqlite-wal'),
      checkMtime('.codex/logs_2.sqlite')
    );

    const antigravityTime = Math.max(
      checkMtime('.gemini/antigravity/conversations'),
      checkMtime('.gemini/antigravity/brain'),
      checkMtime('.gemini/history')
    );

    return { claudeTime, codexTime, antigravityTime };
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
      const now = Date.now();
      const localActivity = this.detectLocalTimestamps();

      const getRelativeActive = (timestamp: number): string => {
        if (!timestamp) return 'Idle';
        const diffMin = Math.floor((now - timestamp) / 60000);
        if (diffMin < 1) return 'Active just now';
        if (diffMin < 60) return `Active ${diffMin}m ago`;
        const diffHours = Math.floor(diffMin / 60);
        if (diffHours < 24) return `Active ${diffHours}h ago`;
        return 'Idle';
      };

      // Query live API quotas and local CLI reports concurrently
      const [codexLiveRes, claudeLiveRes, antigravityLiveRes, cliRes] = await Promise.allSettled([
        this.fetchCodexQuotaLive(forceRefresh),
        this.fetchClaudeQuotaLive(forceRefresh),
        this.fetchAntigravityQuotaLive(forceRefresh),
        this.fetchCliData(forceRefresh),
      ]);

      const codexLive = codexLiveRes.status === 'fulfilled' ? codexLiveRes.value : null;
      const claudeLive = claudeLiveRes.status === 'fulfilled' ? claudeLiveRes.value : null;
      const antigravityLive = antigravityLiveRes.status === 'fulfilled' ? antigravityLiveRes.value : null;
      const { weeklyModels, totalActiveTokens, burnRateDisplay: cliBurnRate, claudeCalculated } =
        cliRes.status === 'fulfilled'
          ? cliRes.value
          : { weeklyModels: {}, totalActiveTokens: 0, burnRateDisplay: undefined, claudeCalculated: undefined };

      // 1. Claude Quota Assembly
      const claudeQuota: ProviderQuota = {
        id: 'claude',
        name: 'Claude',
        subtitle: 'Anthropic Pro/Max',
        models:
          claudeLive?.models ||
          claudeCalculated?.models ||
          (weeklyModels.claude?.length ? weeklyModels.claude : ['claude-opus-5-5']),
        lastActive: getRelativeActive(localActivity.claudeTime),
        sessionLimit: claudeLive?.sessionLimit || claudeCalculated?.sessionLimit || {
          label: '5-Hour Session Remaining',
          percentRemaining: 100,
          percentUsed: 0,
          resetCountdown: 'Ready (Idle)',
          resetTimeDisplay: 'Available',
          status: 'normal',
        },
        weeklyLimit: claudeLive?.weeklyLimit || claudeCalculated?.weeklyLimit || {
          label: 'Weekly Limit Remaining',
          percentRemaining: 100,
          percentUsed: 0,
          resetCountdown: 'Resets Sun 4:00 AM',
          resetTimeDisplay: 'Resets Sun 4:00 AM',
          status: 'normal',
        },
      };

      // 2. Codex Quota Assembly
      const codexQuota: ProviderQuota = {
        id: 'codex',
        name: 'Codex / GPT',
        subtitle: 'OpenAI Plus/Team',
        models: codexLive?.models || (weeklyModels.codex?.length ? weeklyModels.codex : ['gpt-5.6-sol']),
        lastActive: getRelativeActive(localActivity.codexTime),
        sessionLimit: codexLive?.sessionLimit || {
          label: '5-Hour Session Remaining',
          percentRemaining: 100,
          percentUsed: 0,
          resetCountdown: 'Ready (Idle)',
          resetTimeDisplay: 'Available',
          status: 'normal',
        },
        weeklyLimit: codexLive?.weeklyLimit || {
          label: 'Weekly Limit Remaining',
          percentRemaining: 100,
          percentUsed: 0,
          resetCountdown: 'Ready (Idle)',
          resetTimeDisplay: 'Available',
          status: 'normal',
        },
      };

      // 3. Antigravity Quota Assembly
      const antigravityQuota: ProviderQuota = {
        id: 'antigravity',
        name: 'Antigravity',
        subtitle: 'Google Advanced',
        models: antigravityLive?.models || (weeklyModels.antigravity?.length ? weeklyModels.antigravity : ['gemini-3.8-flash']),
        lastActive: getRelativeActive(localActivity.antigravityTime),
        sessionLimit: antigravityLive?.sessionLimit || {
          label: 'Five Hour Limit Remaining',
          percentRemaining: 100,
          percentUsed: 0,
          resetCountdown: 'Ready (Idle)',
          resetTimeDisplay: 'Available',
          status: 'normal',
        },
        weeklyLimit: antigravityLive?.weeklyLimit || {
          label: 'Weekly Limit Remaining',
          percentRemaining: 100,
          percentUsed: 0,
          resetCountdown: 'Ready (Idle)',
          resetTimeDisplay: 'Available',
          status: 'normal',
        },
      };

      const avgLoadPercent = Math.round(
        (claudeQuota.sessionLimit.percentUsed +
          codexQuota.sessionLimit.percentUsed +
          antigravityQuota.sessionLimit.percentUsed) / 3
      );

      let burnRateDisplay = 'Idle';
      if (cliBurnRate) {
        burnRateDisplay = cliBurnRate;
      } else if (this.lastTokenRecord && totalActiveTokens > this.lastTokenRecord.tokens) {
        const diffTokens = totalActiveTokens - this.lastTokenRecord.tokens;
        const diffMinutes = (now - this.lastTokenRecord.timestamp) / 60000;
        if (diffMinutes > 0 && diffMinutes < 120) {
          const tokensPerHr = Math.round((diffTokens / diffMinutes) * 60);
          burnRateDisplay = tokensPerHr >= 1000 ? `~${(tokensPerHr / 1000).toFixed(1)}k/h` : `~${tokensPerHr}/h`;
        }
      }
      this.lastTokenRecord = { tokens: totalActiveTokens, timestamp: now };

      const widgetData: WidgetData = {
        lastUpdated: new Date().toLocaleTimeString(),
        lastSyncTimestamp: now,
        isWatcherActive: true,
        totalActiveTokens,
        sessionLoadPercent: avgLoadPercent,
        activeProvidersCount: 3,
        burnRateDisplay,
        providers: {
          claude: claudeQuota,
          codex: codexQuota,
          antigravity: antigravityQuota,
        },
        error: null,
        isLoading: false,
      };

      this.cachedData = widgetData;
      return widgetData;
    } finally {
      this.isFetching = false;
    }
  }

  private async fetchCliData(forceRefresh = false): Promise<{
    weeklyModels: { claude?: string[]; codex?: string[]; antigravity?: string[] };
    totalActiveTokens: number;
    burnRateDisplay?: string;
    claudeCalculated?: {
      sessionLimit: LimitRemaining;
      weeklyLimit: LimitRemaining;
      models: string[];
    };
  }> {
    const now = Date.now();
    let totalActiveTokens = 0;
    let burnRateDisplay: string | undefined;
    let claudeCalculated: {
      sessionLimit: LimitRemaining;
      weeklyLimit: LimitRemaining;
      models: string[];
    } | undefined;

    let weeklyModels: { claude?: string[]; codex?: string[]; antigravity?: string[] } = {};
    let claudeWeeklyCost = 0;
    let claudeWeeklyTokens = 0;

    try {
      const cmd = this.resolveCcusageBinary();

      // 1. Fetch 5-Hour Rolling Blocks (instant: ~30ms)
      let activeBlock: BlockItem | undefined;
      try {
        const { stdout } = await execAsync(`${cmd} blocks --json`, EXEC_OPTIONS);
        const blocksData = JSON.parse(stdout.trim()) as BlocksOutput;
        if (blocksData?.blocks) {
          activeBlock =
            blocksData.blocks.find((b) => b.isActive) ||
            [...blocksData.blocks].reverse().find((b) => !b.isGap && new Date(b.endTime).getTime() > now);

          if (activeBlock?.totalTokens) {
            totalActiveTokens = activeBlock.totalTokens;
          }
          if (activeBlock?.burnRate?.tokensPerMinute && activeBlock.burnRate.tokensPerMinute > 0) {
            const tokensPerHr = Math.round(activeBlock.burnRate.tokensPerMinute * 60);
            burnRateDisplay = tokensPerHr >= 1000 ? `~${(tokensPerHr / 1000).toFixed(1)}k/h` : `~${tokensPerHr}/h`;
          }
        }
      } catch (blocksErr: any) {
        console.warn('[CcusageService] blocks parse error:', blocksErr.message);
      }

      // 2. Fetch or Use Cached Weekly Data
      if (!forceRefresh && this.cachedWeeklyResult && now - this.lastWeeklyFetch < 180000) {
        weeklyModels = this.cachedWeeklyResult.weeklyModels;
        claudeWeeklyCost = this.cachedWeeklyResult.claudeWeeklyCost;
        claudeWeeklyTokens = this.cachedWeeklyResult.claudeWeeklyTokens;
      } else {
        try {
          const { stdout } = await execAsync(`${cmd} weekly --json`, EXEC_OPTIONS);
          const weeklyData = JSON.parse(stdout.trim()) as WeeklyOutput;
          if (weeklyData?.weekly && weeklyData.weekly.length > 0) {
            const currentWeek = weeklyData.weekly[weeklyData.weekly.length - 1];
            if (currentWeek.modelBreakdowns) {
              for (const item of currentWeek.modelBreakdowns) {
                const nameLower = item.modelName.toLowerCase();
                if (nameLower.includes('claude')) {
                  weeklyModels.claude = weeklyModels.claude || [];
                  if (!weeklyModels.claude.includes(item.modelName)) weeklyModels.claude.push(item.modelName);
                  claudeWeeklyCost += item.cost || 0;
                  claudeWeeklyTokens +=
                    (item.cacheCreationTokens || 0) +
                    (item.cacheReadTokens || 0) +
                    (item.inputTokens || 0) +
                    (item.outputTokens || 0);
                } else if (
                  nameLower.includes('gpt') ||
                  nameLower.includes('codex') ||
                  nameLower.includes('o1') ||
                  nameLower.includes('o3')
                ) {
                  weeklyModels.codex = weeklyModels.codex || [];
                  if (!weeklyModels.codex.includes(item.modelName)) weeklyModels.codex.push(item.modelName);
                } else if (nameLower.includes('gemini') || nameLower.includes('antigravity')) {
                  weeklyModels.antigravity = weeklyModels.antigravity || [];
                  if (!weeklyModels.antigravity.includes(item.modelName)) weeklyModels.antigravity.push(item.modelName);
                }
              }
            }
          }
          this.cachedWeeklyResult = { weeklyModels, claudeWeeklyCost, claudeWeeklyTokens };
          this.lastWeeklyFetch = now;
        } catch (weeklyErr: any) {
          console.warn('[CcusageService] weekly parse error:', weeklyErr.message);
        }
      }

      // 3. Compute High-Precision Claude Local Quota
      // Anthropic Pro 5-hour rolling session allowance: ~$45.00 equivalent (or ~75M tokens)
      let claudeSessionLimit: LimitRemaining;
      if (activeBlock) {
        const costUSD = activeBlock.costUSD || 0;
        const totalTokens = activeBlock.totalTokens || 0;
        const costUsedPct = (costUSD / 45.0) * 100;
        const tokenUsedPct = (totalTokens / 75_000_000) * 100;
        const percentUsed = Math.min(100, Math.max(0, Math.round(costUSD > 0 ? costUsedPct : tokenUsedPct)));
        const percentRemaining = Math.max(0, 100 - percentUsed);

        const resetDate = activeBlock.endTime ? new Date(activeBlock.endTime) : null;
        const diffMs = resetDate ? Math.max(0, resetDate.getTime() - now) : 0;

        claudeSessionLimit = {
          label: '5-Hour Session Remaining',
          percentRemaining,
          percentUsed,
          resetCountdown: diffMs > 0 ? formatCountdown(diffMs) : 'Ready (Idle)',
          resetTimeDisplay: resetDate ? formatResetTimeDisplay(resetDate) : 'Available',
          status: getStatusTier(percentRemaining),
        };
      } else {
        claudeSessionLimit = {
          label: '5-Hour Session Remaining',
          percentRemaining: 100,
          percentUsed: 0,
          resetCountdown: 'Ready (Idle)',
          resetTimeDisplay: 'Available',
          status: 'normal',
        };
      }

      // Anthropic Pro weekly allowance: ~$300.00 equivalent (or ~900M tokens)
      const weeklyCostUsedPct = (claudeWeeklyCost / 300.0) * 100;
      const weeklyTokenUsedPct = (claudeWeeklyTokens / 900_000_000) * 100;
      const weeklyPercentUsed = Math.min(
        100,
        Math.max(0, Math.round(claudeWeeklyCost > 0 ? weeklyCostUsedPct : weeklyTokenUsedPct))
      );
      const weeklyPercentRemaining = Math.max(0, 100 - weeklyPercentUsed);

      const nextSun = getNextSunday4AM();
      const weeklyDiffMs = Math.max(0, nextSun.getTime() - now);

      const claudeWeeklyLimit: LimitRemaining = {
        label: 'Weekly Limit Remaining',
        percentRemaining: weeklyPercentRemaining,
        percentUsed: weeklyPercentUsed,
        resetCountdown: formatCountdown(weeklyDiffMs),
        resetTimeDisplay: 'Resets Sun 4:00 AM',
        status: getStatusTier(weeklyPercentRemaining),
      };

      const detectedClaudeModels =
        activeBlock?.models && activeBlock.models.length > 0
          ? activeBlock.models
          : weeklyModels.claude && weeklyModels.claude.length > 0
          ? weeklyModels.claude
          : ['claude-opus-5-5'];

      claudeCalculated = {
        sessionLimit: claudeSessionLimit,
        weeklyLimit: claudeWeeklyLimit,
        models: detectedClaudeModels,
      };
    } catch {
      // non-fatal
    }

    return { weeklyModels, totalActiveTokens, burnRateDisplay, claudeCalculated };
  }
}
