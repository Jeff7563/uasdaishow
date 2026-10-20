import { Notification } from 'electron';
import type { WidgetData, LimitRemaining } from '../../src/types/ccusage';

interface ProviderPreviousState {
  sessionPercent: number;
  weeklyPercent: number;
}

export class NotificationService {
  private previousStates = new Map<string, ProviderPreviousState>();
  private lastAlertTimestamps = new Map<string, number>();
  private onNotificationClickCallback: (() => void) | null = null;
  private isInitialized = false;

  constructor(onClick?: () => void) {
    if (onClick) {
      this.onNotificationClickCallback = onClick;
    }
  }

  public setOnClick(onClick: () => void) {
    this.onNotificationClickCallback = onClick;
  }

  public checkAndNotify(data: WidgetData): void {
    if (!Notification.isSupported()) {
      return;
    }

    const now = Date.now();
    const providers = [
      data.providers.claude,
      data.providers.codex,
      data.providers.antigravity,
    ];

    for (const provider of providers) {
      if (!provider) continue;

      const prevState = this.previousStates.get(provider.id);
      const currentSession = provider.sessionLimit.percentRemaining;
      const currentWeekly = provider.weeklyLimit.percentRemaining;

      // Skip first run to establish baseline without triggering alert spam on app launch
      if (prevState && this.isInitialized) {
        // 1. Quota Restored to 100% (🎉)
        if (prevState.sessionPercent < 100 && currentSession === 100) {
          const alertKey = `${provider.id}_session_restored`;
          const lastSent = this.lastAlertTimestamps.get(alertKey) || 0;
          // 15-minute cooldown
          if (now - lastSent > 15 * 60 * 1000) {
            this.sendNotification(
              `🎉 ${provider.name} Session Restored!`,
              `5-Hour session limit has reset to 100%. Ready for your prompts!`,
              alertKey
            );
          }
        }

        // 2. Low Quota Warnings (<= 15% Remaining) (⚠️)
        this.checkLimitThreshold(provider.name, provider.id, 'session', provider.sessionLimit, prevState.sessionPercent, now);
        this.checkLimitThreshold(provider.name, provider.id, 'weekly', provider.weeklyLimit, prevState.weeklyPercent, now);
      }

      // Update stored state
      this.previousStates.set(provider.id, {
        sessionPercent: currentSession,
        weeklyPercent: currentWeekly,
      });
    }

    this.isInitialized = true;
  }

  private checkLimitThreshold(
    providerName: string,
    providerId: string,
    limitType: 'session' | 'weekly',
    limit: LimitRemaining,
    prevPercent: number,
    now: number
  ): void {
    if (limit.percentRemaining <= 15) {
      const alertKey = `${providerId}_${limitType}_low`;
      const lastSent = this.lastAlertTimestamps.get(alertKey) || 0;
      // 45-minute cooldown for low warnings, or if it dropped from above 15%
      const droppedBelowThreshold = prevPercent > 15 && limit.percentRemaining <= 15;
      const cooldownExpired = now - lastSent > 45 * 60 * 1000;

      if (droppedBelowThreshold || cooldownExpired) {
        this.sendNotification(
          `⚠️ ${providerName} Quota Low!`,
          `${limit.label} is at ${limit.percentRemaining}% left (${limit.resetCountdown}).`,
          alertKey
        );
      }
    }
  }

  private sendNotification(title: string, body: string, key: string): void {
    try {
      this.lastAlertTimestamps.set(key, Date.now());
      const notif = new Notification({
        title,
        body,
        silent: false,
      });

      if (this.onNotificationClickCallback) {
        notif.on('click', () => {
          this.onNotificationClickCallback?.();
        });
      }

      notif.show();
      console.log(`[Notification] Sent: ${title} - ${body}`);
    } catch (err) {
      console.warn('[Notification] Failed to display notification:', err);
    }
  }
}

