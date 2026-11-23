import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createHttpApp } from '../src/http.ts';

async function startApp() {
  const app = createHttpApp({ startedAt: 0, now: () => 10_000 });
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, server };
}

test('health reports ok with uptime in seconds', async (t) => {
  const { base, server } = await startApp();
  t.after(() => server.close());

  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok', uptimeSeconds: 10 });
});

test('responses do not advertise Express', async (t) => {
  const { base, server } = await startApp();
  t.after(() => server.close());

  const res = await fetch(`${base}/health`);
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('unknown routes return 404', async (t) => {
  const { base, server } = await startApp();
  t.after(() => server.close());

  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
});
