import type { PlatformAdapter } from '../../src/adapters/adapter.ts';
import type { ChatEvent } from '../../src/types.ts';

export class FakeAdapter implements PlatformAdapter {
  readonly platform = 'twitch';
  joins: string[] = [];
  leaves: string[] = [];
  failNextJoin = false;
  readonly #handlers: ((event: ChatEvent) => void)[] = [];

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async join(channel: string): Promise<void> {
    this.joins.push(channel);
    if (this.failNextJoin) {
      this.failNextJoin = false;
      throw new Error('join failed');
    }
  }

  async leave(channel: string): Promise<void> {
    this.leaves.push(channel);
  }

  onEvent(handler: (event: ChatEvent) => void): void {
    this.#handlers.push(handler);
  }

  /** Test-only: simulate the platform delivering an event. */
  emit(event: ChatEvent): void {
    for (const handler of this.#handlers) handler(event);
  }
}
