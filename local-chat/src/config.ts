export interface Config {
  readonly port: number;
  readonly kick: {
    readonly clientId: string;
    readonly clientSecret: string;
  };
  readonly youtube: {
    readonly apiKey: string;
  };
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
