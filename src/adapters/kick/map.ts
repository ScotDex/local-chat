import { sortRoles } from '../../roles.ts';
import type { ChatMessage, MessagePart, Role } from '../../types.ts';

/** Kick writes emotes inline as [emote:<id>:<name>]. */
const EMOTE_TOKEN = /\[emote:(\d+):([^\]]+)\]/g;

/** Kick badge type → our role. A Map, so a badge called "constructor" can't match anything. */
const BADGE_ROLES = new Map<string, Role>([
  ['broadcaster', 'broadcaster'],
  ['moderator', 'mod'],
  ['vip', 'vip'],
  ['subscriber', 'sub'],
  ['founder', 'sub'],
]);

export const kickEmoteUrl = (id: string): string =>
  `https://files.kick.com/emotes/${id}/fullsize`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const asId = (value: unknown): string | null =>
  Number.isSafeInteger(value) ? String(value) : null;

/** Splits Kick's content into text and emote parts, in order. */
export function buildKickParts(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let last = 0;
  for (const match of content.matchAll(EMOTE_TOKEN)) {
    const [token, id, name] = match;
    if (id === undefined || name === undefined) continue;
    if (match.index > last) {
      parts.push({ kind: 'text', text: content.slice(last, match.index) });
    }
    parts.push({ kind: 'emote', name, url: kickEmoteUrl(id) });
    last = match.index + token.length;
  }
  if (last < content.length) {
    parts.push({ kind: 'text', text: content.slice(last) });
  }
  return parts;
}

function rolesFrom(identity: unknown): readonly Role[] {
  if (!isRecord(identity) || !Array.isArray(identity.badges)) return [];
  const roles = new Set<Role>();
  for (const badge of identity.badges) {
    if (!isRecord(badge) || typeof badge.type !== 'string') continue;
    const role = BADGE_ROLES.get(badge.type);
    if (role) roles.add(role);
  }
  return sortRoles(roles);
}

/** A Kick chat.message.sent payload as a ChatMessage, or null if it isn't one. */
export function mapKickChat(
  payload: unknown,
  isKnownBot: (login: string) => boolean,
  receivedAt: number,
): ChatMessage | null {
  if (!isRecord(payload)) return null;
  const broadcaster = payload.broadcaster;
  const sender = payload.sender;
  if (!isRecord(broadcaster) || !isRecord(sender)) return null;

  const id = asText(payload.message_id);
  const channel = asId(broadcaster.user_id);
  const userId = asId(sender.user_id);
  const name = asText(sender.username);
  const content = typeof payload.content === 'string' ? payload.content : null;
  if (!id || !channel || !userId || !name || content === null) return null;

  const login = (asText(sender.channel_slug) ?? name).toLowerCase();
  const identity = sender.identity;
  const avatar = asText(sender.profile_picture);
  const sentAt = Date.parse(asText(payload.created_at) ?? '');

  return {
    type: 'chat',
    platform: 'kick',
    channel,
    id,
    userId,
    login,
    name,
    color: isRecord(identity) ? asText(identity.username_color) : null,
    avatarUrl: avatar?.startsWith('https://') ? avatar : null,
    roles: rolesFrom(identity),
    isBot: isKnownBot(login),
    text: content.replace(EMOTE_TOKEN, '$2'),
    parts: buildKickParts(content),
    timestamp: Number.isNaN(sentAt) ? receivedAt : sentAt,
  };
}
