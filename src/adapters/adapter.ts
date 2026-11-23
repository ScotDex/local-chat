import type { ChatEvent, Platform } from '../types.ts';

export interface PlatformAdapter {
  readonly platform: Platform;
  start(): Promise<void>;
  stop(): Promise<void>;
  join(channel: string): Promise<void>;
  leave(channel: string): Promise<void>;
  onEvent(handler: (event: ChatEvent) => void): void;
}
