export type Platform = 'twitch' | 'kick' | 'youtube';

export type Role = 'broadcaster' | 'mod' | 'vip' | 'sub';

export type MessagePart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'emote'; readonly name: string; readonly url: string };

interface EventBase {
  readonly platform: Platform;
  readonly channel: string;
}

export interface ChatMessage extends EventBase {
  readonly type: 'chat';
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly color: string | null;
  readonly roles: readonly Role[];
  readonly isBot: boolean;
  readonly text: string;
  readonly parts: readonly MessagePart[];
  readonly timestamp: number;
}

export interface DeleteEvent extends EventBase {
  readonly type: 'delete';
  readonly messageId: string;
}

export interface BanEvent extends EventBase {
  readonly type: 'ban';
  readonly userId: string;
}

export type ChatEvent = ChatMessage | DeleteEvent | BanEvent;
