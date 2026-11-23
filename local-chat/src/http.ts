import express, { type Express } from 'express';
import { fileURLToPath } from 'node:url';

const OVERLAY_DIR = fileURLToPath(new URL('../overlay', import.meta.url));

export interface HttpAppOptions {
  startedAt: number;
  now?: () => number;
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

  return app;
}
