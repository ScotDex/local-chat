import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  KickVerifier,
  TOLERANCE_MS,
} from '../../../src/adapters/kick/verify.ts';

const NOW = Date.parse('2026-11-24T12:00:00Z');
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

function signed(body: string, id = 'msg-1', sentAt = NOW) {
  const timestamp = new Date(sentAt).toISOString();
  const rawBody = Buffer.from(body);
  const signature = sign(
    'sha256',
    Buffer.concat([Buffer.from(`${id}.${timestamp}.`), rawBody]),
    privateKey,
  ).toString('base64');
  return {
    headers: {
      'kick-event-message-id': id,
      'kick-event-message-timestamp': timestamp,
      'kick-event-signature': signature,
    },
    rawBody,
  };
}

const verifier = () => new KickVerifier({ now: () => NOW });

test('a correctly signed message is accepted', () => {
  const { headers, rawBody } = signed('{"hello":1}');
  assert.equal(verifier().verify(publicKey, headers, rawBody), 'ok');
});

test('a changed body is rejected', () => {
  const { headers } = signed('{"hello":1}');
  const tampered = Buffer.from('{"hello":2}');
  assert.equal(
    verifier().verify(publicKey, headers, tampered),
    'bad-signature',
  );
});

test('without a key, nothing is accepted', () => {
  const { headers, rawBody } = signed('{}');
  assert.equal(verifier().verify(null, headers, rawBody), 'no-key');
});

test('a missing header is rejected', () => {
  const { headers, rawBody } = signed('{}');
  const { 'kick-event-signature': _removed, ...withoutSignature } = headers;
  assert.equal(
    verifier().verify(publicKey, withoutSignature, rawBody),
    'missing-headers',
  );
});

test('a message older than the window is rejected', () => {
  const { headers, rawBody } = signed('{}', 'old', NOW - TOLERANCE_MS - 1);
  assert.equal(verifier().verify(publicKey, headers, rawBody), 'stale');
});

test('the same message is only accepted once', () => {
  const check = verifier();
  const { headers, rawBody } = signed('{}');
  assert.equal(check.verify(publicKey, headers, rawBody), 'ok');
  assert.equal(check.verify(publicKey, headers, rawBody), 'duplicate');
});

test('a forged message does not block the real one with the same ID', () => {
  const check = verifier();
  const real = signed('{"real":true}', 'shared-id');
  const forged = { ...real.headers, 'kick-event-signature': 'AAAA' };
  assert.equal(check.verify(publicKey, forged, real.rawBody), 'bad-signature');
  assert.equal(check.verify(publicKey, real.headers, real.rawBody), 'ok');
});
