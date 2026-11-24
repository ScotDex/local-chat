import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';

const validEnv = {
  KICK_CLIENT_ID: 'kick-id',
  KICK_CLIENT_SECRET: 'kick-secret',
  YOUTUBE_API_KEY: 'yt-key',
};

test('loads a complete environment', () => {
  const config = loadConfig(validEnv);
  assert.equal(config.kick.clientId, 'kick-id');
  assert.equal(config.youtube.apiKey, 'yt-key');
});

test('defaults PORT to 3000 when not set', () => {
  assert.equal(loadConfig(validEnv).port, 3000);
});

test('lists every missing variable in one error', () => {
  assert.throws(
    () => loadConfig({}),
    /KICK_CLIENT_ID, KICK_CLIENT_SECRET, YOUTUBE_API_KEY/,
  );
});

test('treats a whitespace-only value as missing', () => {
  assert.throws(
    () => loadConfig({ ...validEnv, YOUTUBE_API_KEY: '   ' }),
    /YOUTUBE_API_KEY/,
  );
});

test('rejects a PORT that is not a whole number', () => {
  assert.throws(() => loadConfig({ ...validEnv, PORT: 'abc' }), /PORT must be/);
});

const kickAndYoutube = {
  KICK_CLIENT_ID: 'id',
  KICK_CLIENT_SECRET: 'secret',
  YOUTUBE_API_KEY: 'key',
};

test('without TLS settings, the server runs plain HTTP', () => {
  assert.equal(loadConfig(kickAndYoutube).tls, null);
});

test('with both TLS settings, their paths are used', () => {
  const config = loadConfig({
    ...kickAndYoutube,
    TLS_CERT_FILE: '/ssl/cert.pem',
    TLS_KEY_FILE: '/ssl/cert.key',
  });
  assert.deepEqual(config.tls, {
    certFile: '/ssl/cert.pem',
    keyFile: '/ssl/cert.key',
  });
});

test('only one TLS setting is refused', () => {
  assert.throws(
    () => loadConfig({ ...kickAndYoutube, TLS_CERT_FILE: '/ssl/cert.pem' }),
    /must be set together/,
  );
});
