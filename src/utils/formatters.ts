export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000_000) {
    return `${(tokens / 1_000_000_000).toFixed(2)}B`;
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return tokens.toLocaleString();
}

export function formatUSD(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return `< $0.01`;
  return `$${amount.toFixed(2)}`;
}

export function formatCountdown(endTimeISO: string): {
  formatted: string;
  remainingMs: number;
  percentElapsed: number;
} {
  const end = new Date(endTimeISO).getTime();
  const now = Date.now();
  const diff = Math.max(0, end - now);

  const totalBlockMs = 5 * 60 * 60 * 1000; // 5 hours standard rolling session
  const elapsed = Math.min(totalBlockMs, Math.max(0, totalBlockMs - diff));
  const percentElapsed = Math.min(100, Math.round((elapsed / totalBlockMs) * 100));

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatted = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return {
    formatted,
    remainingMs: diff,
    percentElapsed,
  };
}

