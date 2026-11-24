export interface TlsFiles {
  readonly certFile: string;
  readonly keyFile: string;
}

export interface Config {
  readonly port: number;
  readonly kick: {
    readonly clientId: string;
    readonly clientSecret: string;
  };
  readonly youtube: {
    readonly apiKey: string;
  };
  /** Certificate and key paths to serve HTTPS; null means plain HTTP. */
  readonly tls: TlsFiles | null;
}

function required(
  env: NodeJS.ProcessEnv,
  name: string,
  missing: string[],
): string {
  const value = env[name]?.trim();
  if (!value) {
    missing.push(name);
    return '';
  }
  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function loadTls(env: NodeJS.ProcessEnv): TlsFiles | null {
  const certFile = optional(env, 'TLS_CERT_FILE');
  const keyFile = optional(env, 'TLS_KEY_FILE');
  if (certFile && keyFile) return { certFile, keyFile };
  if (certFile || keyFile) {
    throw new Error('TLS_CERT_FILE and TLS_KEY_FILE must be set together');
  }
  return null;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const missing: string[] = [];

  const config: Config = {
    port: Number(env.PORT ?? '3000'),
    kick: {
      clientId: required(env, 'KICK_CLIENT_ID', missing),
      clientSecret: required(env, 'KICK_CLIENT_SECRET', missing),
    },
    youtube: {
      apiKey: required(env, 'YOUTUBE_API_KEY', missing),
    },
    tls: loadTls(env),
  };

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  if (!Number.isInteger(config.port) || config.port <= 0) {
    throw new Error(`PORT must be a positive whole number, got "${env.PORT}"`);
  }

  return config;
}
