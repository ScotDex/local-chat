import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSubscription } from '../src/subscription.ts';

test('accepts a Twitch channel and normalises it', () => {
  assert.deepEqual(
    parseSubscription({ platform: 'twitch', channel: '  Limmy ' }),
    {
      ok: true,
      value: { platform: 'twitch', channel: 'limmy' },
    },
  );
});

test('rejects Twitch names with invalid characters', () => {
  const result = parseSubscription({
    platform: 'twitch',
    channel: 'limmy<script>',
  });
  assert.equal(result.ok, false);
});

test('accepts a Kick broadcaster ID and trims it', () => {
  assert.deepEqual(parseSubscription({ platform: 'kick', channel: ' 123 ' }), {
    ok: true,
    value: { platform: 'kick', channel: '123' },
  });
});

test('rejects Kick channels that are not a positive whole-number ID', () => {
  for (const channel of ['someone', '0', '012', '-5', '1.5', '9'.repeat(17)]) {
    assert.equal(
      parseSubscription({ platform: 'kick', channel }).ok,
      false,
      channel,
    );
  }
});

test('rejects Twitch names that are too long', () => {
  const result = parseSubscription({
    platform: 'twitch',
    channel: 'a'.repeat(26),
  });
  assert.equal(result.ok, false);
});

test('rejects an empty channel', () => {
  assert.equal(
    parseSubscription({ platform: 'twitch', channel: '   ' }).ok,
    false,
  );
});

test('reports platforms that are not supported yet', () => {
  assert.deepEqual(
    parseSubscription({ platform: 'youtube', channel: 'someone' }),
    {
      ok: false,
      error: 'youtube is not supported yet',
    },
  );
});

test('rejects unknown platforms and malformed input', () => {
  assert.equal(
    parseSubscription({ platform: 'myspace', channel: 'x' }).ok,
    false,
  );
  assert.equal(
    parseSubscription({ platform: 'twitch', channel: 42 }).ok,
    false,
  );
  assert.equal(parseSubscription(null).ok, false);
  assert.equal(parseSubscription('twitch:limmy').ok, false);
});
