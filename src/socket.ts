import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { PlatformAdapter } from './adapters/adapter.ts';
import { CapacityError, type ChannelRegistry } from './registry.ts';
import { parseSubscription, type Subscription } from './subscription.ts';

export const MAX_CHANNELS_PER_CONNECTION = 5;

type AckResponse = { ok: true } | { ok: false; error: string };
type Ack = (response: AckResponse) => void;

export interface SocketServerOptions {
  httpServer: HttpServer;
  registry: ChannelRegistry;
  adapters: readonly PlatformAdapter[];
}

function roomOf(target: Subscription): string {
  return `${target.platform}:${target.channel}`;
}

function toAck(ack: unknown): Ack {
  return typeof ack === 'function' ? (ack as Ack) : () => undefined;
}

export function createSocketServer(options: SocketServerOptions): Server {
  const { registry } = options;

  const io = new Server(options.httpServer, { cors: { origin: '*' } });

  for (const adapter of options.adapters) {
    adapter.onEvent((event) => {
      io.to(roomOf(event)).emit('chat-event', event);
    });
  }

  io.on('connection', (socket) => {
    const claimed = new Set<string>();
    const active = new Map<string, Subscription>();

    socket.on('subscribe', async (input: unknown, ack: unknown) => {
      const reply = toAck(ack);
      const parsed = parseSubscription(input);
      if (!parsed.ok) {
        reply(parsed);
        return;
      }

      const sub = parsed.value;
      const room = roomOf(sub);
      if (claimed.has(room)) {
        reply({ ok: true });
        return;
      }
      if (claimed.size >= MAX_CHANNELS_PER_CONNECTION) {
        reply({
          ok: false,
          error: `Limit of ${MAX_CHANNELS_PER_CONNECTION} channels per connection`,
        });
        return;
      }

      claimed.add(room);
      try {
        await registry.subscribe(sub.platform, sub.channel);
      } catch (err) {
        claimed.delete(room);
        if (err instanceof CapacityError) {
          console.warn(`[socket] refused ${room}: ${err.message}`);
          reply({
            ok: false,
            error: 'The server is at capacity right now. Try again later.',
          });
        } else {
          console.error(`[socket] could not subscribe to ${room}`, err);
          reply({ ok: false, error: 'Could not join that channel' });
        }
        return;
      }

      if (!socket.connected) {
        registry.unsubscribe(sub.platform, sub.channel);
        return;
      }

      active.set(room, sub);
      void socket.join(room);
      reply({ ok: true });
    });

    socket.on('unsubscribe', (input: unknown, ack: unknown) => {
      const reply = toAck(ack);
      const parsed = parseSubscription(input);
      if (!parsed.ok) {
        reply(parsed);
        return;
      }

      const room = roomOf(parsed.value);
      const sub = active.get(room);
      if (sub) {
        active.delete(room);
        claimed.delete(room);
        void socket.leave(room);
        registry.unsubscribe(sub.platform, sub.channel);
      }
      reply({ ok: true });
    });

    socket.on('disconnect', () => {
      for (const sub of active.values())
        registry.unsubscribe(sub.platform, sub.channel);
      active.clear();
      claimed.clear();
    });
  });

  return io;
}
