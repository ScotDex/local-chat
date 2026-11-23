import type { Platform } from './types.ts';
import type { PlatformAdapter } from './adapters/adapter.ts';

const DEFAULT_GRACE_MS = 60_000;
const DEFAULT_MAX_CHANNELS = 100;

export class CapacityError extends Error {
  constructor(limit: number) {
    super(`Channel limit of ${limit} reached`);
    this.name = 'CapacityError';
  }
}

export interface RegistryOptions {
  graceMs?: number;
  maxChannels?: number;
}

export class ChannelRegistry {
  readonly #adapters: ReadonlyMap<Platform, PlatformAdapter>;
  readonly #graceMs: number;
  readonly #maxChannels: number;
  readonly #watchers = new Map<string, number>();
  readonly #joins = new Map<string, Promise<void>>();
  readonly #leaveTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    adapters: readonly PlatformAdapter[],
    options: RegistryOptions = {},
  ) {
    this.#adapters = new Map<Platform, PlatformAdapter>(
      adapters.map((a) => [a.platform, a]),
    );
    this.#graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
    this.#maxChannels = options.maxChannels ?? DEFAULT_MAX_CHANNELS;
  }

  /** Expects a channel name already validated and normalised for its platform. */
  async subscribe(platform: Platform, channel: string): Promise<void> {
    const key = `${platform}:${channel}`;
    if (!this.#joins.has(key) && this.#joins.size >= this.#maxChannels) {
      throw new CapacityError(this.#maxChannels);
    }
    this.#cancelLeave(key);
    this.#watchers.set(key, (this.#watchers.get(key) ?? 0) + 1);
    try {
      await this.#ensureJoined(platform, channel, key);
    } catch (err) {
      this.#decrement(key);
      throw err;
    }
  }

  unsubscribe(platform: Platform, channel: string): void {
    const key = `${platform}:${channel}`;
    const remaining = this.#decrement(key);
    if (remaining > 0 || !this.#joins.has(key)) return;
    const timer = setTimeout(
      () => this.#leaveNow(platform, channel, key),
      this.#graceMs,
    );
    this.#leaveTimers.set(key, timer);
  }

  /** Cancels pending leaves so the process can exit cleanly on shutdown. */
  dispose(): void {
    for (const timer of this.#leaveTimers.values()) clearTimeout(timer);
    this.#leaveTimers.clear();
  }

  #ensureJoined(
    platform: Platform,
    channel: string,
    key: string,
  ): Promise<void> {
    let join = this.#joins.get(key);
    if (!join) {
      join = this.#adapter(platform).join(channel);
      this.#joins.set(key, join);
      join.catch(() => this.#joins.delete(key)); // a failed join must be retryable
    }
    return join;
  }

  #leaveNow(platform: Platform, channel: string, key: string): void {
    this.#leaveTimers.delete(key);
    this.#joins.delete(key);
    this.#adapter(platform)
      .leave(channel)
      .catch((err: unknown) =>
        console.error(`[registry] failed to leave ${key}`, err),
      );
  }

  #cancelLeave(key: string): void {
    const timer = this.#leaveTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.#leaveTimers.delete(key);
    }
  }

  #decrement(key: string): number {
    const count = (this.#watchers.get(key) ?? 0) - 1;
    if (count <= 0) {
      this.#watchers.delete(key);
      return 0;
    }
    this.#watchers.set(key, count);
    return count;
  }

  #adapter(platform: Platform): PlatformAdapter {
    const adapter = this.#adapters.get(platform);
    if (!adapter) throw new Error(`No adapter registered for ${platform}`);
    return adapter;
  }
}
