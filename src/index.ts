import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { loadConfig } from './config.ts';
import { createHttpApp } from './http.ts';
import { createSocketServer } from './socket.ts';
import { ChannelRegistry } from './registry.ts';
import { Presence } from './presence.ts';
import { createTwitchAdapter } from './adapters/twitch/adapter.ts';
import { isKnownBot } from './bots.ts';
import { EmoteCache } from './emotes/cache.ts';
import { createKickAdapter } from './adapters/kick/adapter.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig(process.env);
const startedAt = Date.now();
const kick = createKickAdapter(config.kick, isKnownBot);
const adapters = [
  createTwitchAdapter({ isKnownBot, emotes: new EmoteCache() }),
  kick,
];
const presence = new Presence();
const registry = new ChannelRegistry(adapters, {
  onLeave: (platform, channel) => presence.forget(platform, channel),
});

const app = createHttpApp({
  startedAt,
  kickWebhook: (headers, rawBody) => kick.handleWebhook(headers, rawBody),
});
const httpServer = config.tls
  ? createHttpsServer(
      {
        cert: readFileSync(config.tls.certFile),
        key: readFileSync(config.tls.keyFile),
      },
      app,
    )
  : createHttpServer(app);
const protocol = config.tls ? 'https' : 'http';

const io = createSocketServer({ httpServer, registry, adapters, presence });

for (const adapter of adapters) await adapter.start();
httpServer.listen(config.port, () => {
  console.log(`[connector] listening on port ${config.port} (${protocol})`);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[connector] ${signal} received, shutting down`);

  // If anything hangs, exit anyway rather than wait to be killed
  setTimeout(() => {
    console.error('[connector] shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    await io.close(); // disconnects overlays and closes the HTTP server
    registry.dispose();
    for (const adapter of adapters) await adapter.stop();
    console.log('[connector] stopped cleanly');
    process.exit(0);
  } catch (err) {
    console.error('[connector] error during shutdown', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
