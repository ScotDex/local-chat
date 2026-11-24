import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKickParts,
  kickEmoteUrl,
  mapKickChat,
} from '../../../src/adapters/kick/map.ts';

const RECEIVED = Date.parse('2026-11-24T12:00:00Z');
const noBots = () => false;

/** Kick's documented chat.message.sent example, comments removed. */
function examplePayload() {
  return {
    message_id: 'unique_message_id_123',
    broadcaster: {
      is_anonymous: false,
      user_id: 123456789,
      username: 'broadcaster_name',
      is_verified: true,
      profile_picture: 'https://example.com/broadcaster_avatar.jpg',
      channel_slug: 'broadcaster_channel',
      identity: null,
    },
    sender: {
      is_anonymous: false,
      user_id: 987654321,
      username: 'sender_name',
      is_verified: false,
      profile_picture: 'https://example.com/sender_avatar.jpg',
      channel_slug: 'sender_channel',
      identity: {
        username_color: '#FF5733',
        badges: [
          { text: 'Moderator', type: 'moderator' },
          { text: 'Sub Gifter', type: 'sub_gifter', count: 5 },
          { text: 'Subscriber', type: 'subscriber', count: 3 },
        ],
      },
    },
    content:
      'Hello [emote:4148074:HYPERCLAP] [emote:4148074:HYPERCLAP] [emote:37226:KEKW]',
    emotes: [],
    created_at: '2025-01-14T16:08:06Z',
  };
}

test('maps the documented example', () => {
  const message = mapKickChat(examplePayload(), noBots, RECEIVED);
  assert.ok(message);
  assert.equal(message.platform, 'kick');
  assert.equal(message.channel, '123456789');
  assert.equal(message.id, 'unique_message_id_123');
  assert.equal(message.userId, '987654321');
  assert.equal(message.login, 'sender_channel');
  assert.equal(message.name, 'sender_name');
  assert.equal(message.color, '#FF5733');
  assert.equal(message.avatarUrl, 'https://example.com/sender_avatar.jpg');
  assert.deepEqual(message.roles, ['mod', 'sub']);
  assert.equal(message.timestamp, Date.parse('2025-01-14T16:08:06Z'));
  assert.equal(message.text, 'Hello HYPERCLAP HYPERCLAP KEKW');
});

test('emote codes become emote parts, in order', () => {
  assert.deepEqual(buildKickParts('Hi [emote:37226:KEKW] there'), [
    { kind: 'text', text: 'Hi ' },
    { kind: 'emote', name: 'KEKW', url: kickEmoteUrl('37226') },
    { kind: 'text', text: ' there' },
  ]);
});

test('a sender without identity has no colour or roles', () => {
  const payload = examplePayload();
  const sender = { ...payload.sender, identity: null };
  const message = mapKickChat({ ...payload, sender }, noBots, RECEIVED);
  assert.equal(message?.color, null);
  assert.deepEqual(message?.roles, []);
});

test('anything that is not a chat message is refused', () => {
  const payload = examplePayload();
  assert.equal(mapKickChat(null, noBots, RECEIVED), null);
  assert.equal(
    mapKickChat({ ...payload, sender: undefined }, noBots, RECEIVED),
    null,
  );
  const stringId = { ...payload.sender, user_id: '987654321' };
  assert.equal(
    mapKickChat({ ...payload, sender: stringId }, noBots, RECEIVED),
    null,
  );
});

test('an unreadable send time falls back to when it arrived', () => {
  const payload = { ...examplePayload(), created_at: 'not a date' };
  assert.equal(mapKickChat(payload, noBots, RECEIVED)?.timestamp, RECEIVED);
});

test('unexpected badges and non-https avatars are ignored', () => {
  const payload = examplePayload();
  const sender = {
    ...payload.sender,
    profile_picture: 'http://example.com/a.jpg',
    identity: { username_color: '', badges: [{ type: 'constructor' }] },
  };
  const message = mapKickChat({ ...payload, sender }, noBots, RECEIVED);
  assert.equal(message?.avatarUrl, null);
  assert.equal(message?.color, null);
  assert.deepEqual(message?.roles, []);
});
