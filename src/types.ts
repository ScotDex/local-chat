export type Platform = 'twitch' | 'kick' | 'youtube';

/** Always sorted highest first. An empty list means a regular viewer. */
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
  /** Lowercase account name, used to match roster entries and the hide list. YouTube has none, so it uses the channel ID. */
  readonly login: string;
  readonly name: string;
  readonly color: string | null;
  /** Profile picture when the platform sends one (Kick, YouTube); null for Twitch, where the overlay looks it up. */
  readonly avatarUrl: string | null;
  readonly roles: readonly Role[];
  /** Set from the connector's known-bot list or a platform bot signal, not guaranteed by the platform. */
  readonly isBot: boolean;
  readonly text: string;
  readonly parts: readonly MessagePart[];
  readonly timestamp: number;
}

export interface DeleteEvent extends EventBase {
  readonly type: 'delete';
  readonly messageId: string;
}

/** A ban or a timeout: the user's messages are removed either way. */
export interface BanEvent extends EventBase {
  readonly type: 'ban';
  readonly userId: string;
  readonly login: string;
  /** Seconds for a timeout; null for a permanent ban, which also removes the user from the roster. */
  readonly durationSeconds: number | null;
}

/** A moderator cleared the whole chat. */
export interface ClearEvent extends EventBase {
  readonly type: 'clear';
}

/** A viewer arrived (Twitch only). */
export interface JoinEvent extends EventBase {
  readonly type: 'join';
  readonly login: string;
  /** Set from the connector's known-bot list. */
  readonly isBot: boolean;
}

/** A viewer left (Twitch only). */
export interface PartEvent extends EventBase {
  readonly type: 'part';
  readonly login: string;
}

export type ChatEvent =
  ChatMessage | DeleteEvent | BanEvent | ClearEvent | JoinEvent | PartEvent;
