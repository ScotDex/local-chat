import express, { type Express } from 'express';
import type { IncomingHttpHeaders } from 'node:http';
import { fileURLToPath } from 'node:url';

const OVERLAY_DIR = fileURLToPath(new URL('../overlay', import.meta.url));
/** Kick chat payloads are a few kB; anything far larger isn't from Kick. */
const KICK_WEBHOOK_LIMIT = '64kb';

export type WebhookHandler = (
  headers: IncomingHttpHeaders,
  rawBody: Buffer,
) => Promise<void>;

export interface HttpAppOptions {
  startedAt: number;
  now?: () => number;
  /** Receives Kick webhooks. Leave out to not expose the route. */
  kickWebhook?: WebhookHandler;
}

export function createHttpApp(options: HttpAppOptions): Express {
  const now = options.now ?? Date.now;
  const app = express();

  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.floor((now() - options.startedAt) / 1000),
    });
  });
  app.use('/overlay', express.static(OVERLAY_DIR));

  const kickWebhook = options.kickWebhook;
  if (kickWebhook) {
    app.post(
      '/kick/webhook',
      express.raw({ type: 'application/json', limit: KICK_WEBHOOK_LIMIT }),
      (req, res) => {
        // Answer at once so Kick never retries; the signature check happens after
        res.status(200).end();
        if (Buffer.isBuffer(req.body)) void kickWebhook(req.headers, req.body);
      },
    );
  }

  return app;
}