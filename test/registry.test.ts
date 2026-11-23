import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapacityError, ChannelRegistry } from '../src/registry.ts';
import type { PlatformAdapter } from '../src/adapters/adapter.ts';
import type { ChatEvent } from '../src/types.ts';

class FakeAdapter implements PlatformAdapter {
  readonly platform = 'twitch';
  joins: string[] = [];
  leaves: string[] = [];
  failNextJoin = false;

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async join(channel: string): Promise<void> {
    this.joins.push(channel);
    if (this.failNextJoin) {
      this.failNextJoin = false;
      throw new Error('join failed');
    }
  }
  async leave(channel: string): Promise<void> {
    this.leaves.push(channel);
  }
  onEvent(_handler: (event: ChatEvent) => void): void {}
}

function setup() {
  const adapter = new FakeAdapter();
  const registry = new ChannelRegistry([adapter], { graceMs: 60_000 });
  return { adapter, registry };
}

test('the first subscriber joins; the second shares it', async () => {
  const { adapter, registry } = setup();
  await registry.subscribe('twitch', 'limmy');
  await registry.subscribe('twitch', 'limmy');
  assert.deepEqual(adapter.joins, ['limmy']);
});

test('simultaneous subscribers share a single join', async () => {
  const { adapter, registry } = setup();
  await Promise.all([
    registry.subscribe('twitch', 'limmy'),
    registry.subscribe('twitch', 'limmy'),
  ]);
  assert.deepEqual(adapter.joins, ['limmy']);
});

test('the last unsubscribe leaves only after the grace period', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { adapter, registry } = setup();
  await registry.subscribe('twitch', 'limmy');
  registry.unsubscribe('twitch', 'limmy');

  t.mock.timers.tick(59_999);
  assert.deepEqual(adapter.leaves, []);

  t.mock.timers.tick(1);
  assert.deepEqual(adapter.leaves, ['limmy']);
});

test('resubscribing within the grace period cancels the leave', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { adapter, registry } = setup();
  await registry.subscribe('twitch', 'limmy');
  registry.unsubscribe('twitch', 'limmy');
  t.mock.timers.tick(30_000);
  await registry.subscribe('twitch', 'limmy');
  t.mock.timers.tick(60_000);

  assert.deepEqual(adapter.leaves, []);
  assert.deepEqual(adapter.joins, ['limmy']);
});

test('a failed join is reported and can be retried', async () => {
  const { adapter, registry } = setup();
  adapter.failNextJoin = true;
  await assert.rejects(registry.subscribe('twitch', 'limmy'), /join failed/);
  await registry.subscribe('twitch', 'limmy');
  assert.deepEqual(adapter.joins, ['limmy', 'limmy']);
});

test('an unknown platform is rejected', async () => {
  const { registry } = setup();
  await assert.rejects(
    registry.subscribe('kick', 'someone'),
    /No adapter registered for kick/,
  );
});

test('a stray unsubscribe does nothing', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { adapter, registry } = setup();
  registry.unsubscribe('twitch', 'limmy');
  t.mock.timers.tick(60_000);
  assert.deepEqual(adapter.leaves, []);
});

test('dispose cancels pending leaves', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { adapter, registry } = setup();
  await registry.subscribe('twitch', 'limmy');
  registry.unsubscribe('twitch', 'limmy');
  registry.dispose();
  t.mock.timers.tick(60_000);
  assert.deepEqual(adapter.leaves, []);
});

test('refuses a new channel once the limit is reached', async () => {
  const adapter = new FakeAdapter();
  const registry = new ChannelRegistry([adapter], { maxChannels: 2 });
  await registry.subscribe('twitch', 'a');
  await registry.subscribe('twitch', 'b');
  await assert.rejects(registry.subscribe('twitch', 'c'), CapacityError);
  assert.deepEqual(adapter.joins, ['a', 'b']);
});

test('a channel already joined can still be subscribed at the limit', async () => {
  const adapter = new FakeAdapter();
  const registry = new ChannelRegistry([adapter], { maxChannels: 1 });
  await registry.subscribe('twitch', 'a');
  await registry.subscribe('twitch', 'a');
  assert.deepEqual(adapter.joins, ['a']);
});

test('a leave frees a place under the limit', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const adapter = new FakeAdapter();
  const registry = new ChannelRegistry([adapter], {
    maxChannels: 1,
    graceMs: 60_000,
  });
  await registry.subscribe('twitch', 'a');
  registry.unsubscribe('twitch', 'a');
  t.mock.timers.tick(60_000);
  await registry.subscribe('twitch', 'b');
  assert.deepEqual(adapter.joins, ['a', 'b']);
});
