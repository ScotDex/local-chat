import { createServer } from 'node:http';
import { loadConfig } from './config.ts';
import { createHttpApp } from './http.ts';
import { createSocketServer } from './socket.ts';
import { ChannelRegistry } from './registry.ts';
import { createTwitchAdapter } from './adapters/twitch/adapter.ts';
import { isKnownBot } from './bots.ts';
import { EmoteCache } from './emotes/cache.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig(process.env);
const startedAt = Date.now();

const adapters = [
  createTwitchAdapter({ isKnownBot, emotes: new EmoteCache() }),
];
const registry = new ChannelRegistry(adapters);
const httpServer = createServer(createHttpApp({ startedAt }));
const io = createSocketServer({ httpServer, registry, adapters });

for (const adapter of adapters) await adapter.start();
httpServer.listen(config.port, () => {
  console.log(`[connector] listening on port ${config.port}`);
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
