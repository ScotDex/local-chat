import type { IncomingMessage } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { loadConfig } from './config.ts';

/** Docker's health check: exit 0 if /health answers 200, otherwise 1. */
const config = loadConfig(process.env);

const options = {
  host: '127.0.0.1',
  port: config.port,
  path: '/health',
  timeout: 4_000,
};

function onResponse(response: IncomingMessage): void {
  response.resume();
  process.exit(response.statusCode === 200 ? 0 : 1);
}

const request = config.tls
  ? // Loopback only: the Origin certificate is valid for Cloudflare, not for 127.0.0.1
    httpsRequest({ ...options, rejectUnauthorized: false }, onResponse)
  : httpRequest(options, onResponse);

request.on('timeout', () => request.destroy(new Error('timed out')));
request.on('error', () => process.exit(1));
request.end();
