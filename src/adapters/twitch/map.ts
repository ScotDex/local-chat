import type { ChatMessage, MessagePart, Role } from '../../types.ts';
import { sortRoles } from '../../roles.ts';

export interface TwitchEmote {
  readonly id: string;
  readonly start: number;
  readonly end: number;
}

export interface TwitchRawMessage {
  readonly id: string;
  readonly channel: string;
  readonly userId: string;
  readonly login: string; // ← new
  readonly displayName: string;
  readonly color: string | null;
  readonly isBroadcaster: boolean;
  readonly isMod: boolean;
  readonly isVip: boolean;
  readonly isSubscriber: boolean;
  readonly text: string;
  readonly emotes: readonly TwitchEmote[];
  readonly timestamp: number;
}

function twitchEmoteUrl(id: string): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;
}

function buildParts(
  text: string,
  emotes: readonly TwitchEmote[],
): MessagePart[] {
  const chars = Array.from(text);
  const sorted = [...emotes].sort((a, b) => a.start - b.start);
  const parts: MessagePart[] = [];
  let cursor = 0;

  for (const emote of sorted) {
    if (
      emote.start < cursor ||
      emote.start > emote.end ||
      emote.end >= chars.length
    )
      continue;
    if (emote.start > cursor) {
      parts.push({
        kind: 'text',
        text: chars.slice(cursor, emote.start).join(''),
      });
    }
    parts.push({
      kind: 'emote',
      name: chars.slice(emote.start, emote.end + 1).join(''),
      url: twitchEmoteUrl(emote.id),
    });
    cursor = emote.end + 1;
  }

  if (cursor < chars.length) {
    parts.push({ kind: 'text', text: chars.slice(cursor).join('') });
  }
  return parts;
}

export function mapTwitch(
  raw: TwitchRawMessage,
  isKnownBot: (name: string) => boolean,
): ChatMessage {
  const roles: Role[] = [];
  if (raw.isBroadcaster) roles.push('broadcaster');
  if (raw.isMod) roles.push('mod');
  if (raw.isVip) roles.push('vip');
  if (raw.isSubscriber) roles.push('sub');

  return {
    type: 'chat',
    platform: 'twitch',
    channel: raw.channel,
    id: raw.id,
    userId: raw.userId,
    login: raw.login, // ← new
    name: raw.displayName,
    color: raw.color,
    avatarUrl: null, // ← new: Twitch sends no avatar; the overlay looks it up
    roles: sortRoles(roles),
    isBot: isKnownBot(raw.login), // ← changed: was raw.displayName
    text: raw.text,
    parts: buildParts(raw.text, raw.emotes),
    timestamp: raw.timestamp,
  };
}
