export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests");
    this.name = "RateLimitError";
  }
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  consume(key: string, limit: number, windowMs: number, now = Date.now()): void {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (existing.count >= limit) {
      throw new RateLimitError(Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)));
    }
    existing.count += 1;
  }

  reset(): void {
    this.buckets.clear();
  }
}

export const authRateLimiter = new FixedWindowRateLimiter();
export const agentRateLimiter = new FixedWindowRateLimiter();
