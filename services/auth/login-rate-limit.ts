interface AttemptState {
  count: number;
  windowStartedAt: number;
  lastAttemptAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export class LoginRateLimiter {
  private readonly attempts = new Map<string, AttemptState>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(options: { maxAttempts?: number; windowMs?: number; maxKeys?: number } = {}) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.windowMs = options.windowMs ?? 15 * 60 * 1000;
    this.maxKeys = options.maxKeys ?? 1024;
  }

  consume(key: string, now = Date.now()): RateLimitResult {
    let state = this.attempts.get(key);
    if (!state || now - state.windowStartedAt >= this.windowMs) {
      state = { count: 0, windowStartedAt: now, lastAttemptAt: now };
    }
    if (state.count >= this.maxAttempts) {
      state.lastAttemptAt = now;
      this.attempts.set(key, state);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((state.windowStartedAt + this.windowMs - now) / 1000)),
      };
    }
    state.count += 1;
    state.lastAttemptAt = now;
    this.attempts.delete(key);
    this.attempts.set(key, state);
    this.trim(now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  private trim(now: number): void {
    for (const [key, state] of this.attempts) {
      if (now - state.windowStartedAt >= this.windowMs) this.attempts.delete(key);
    }
    while (this.attempts.size > this.maxKeys) {
      const oldest = this.attempts.keys().next().value;
      if (oldest === undefined) break;
      this.attempts.delete(oldest);
    }
  }
}

export const loginRateLimiter = new LoginRateLimiter();
