const TOKEN_URL = 'https://id.kick.com/oauth/token';
const REFRESH_MARGIN_MS = 60_000;

export interface KickTokenOptions {
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

function parseTokenResponse(body: unknown): {
  accessToken: string;
  expiresIn: number;
} {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Kick token response was not an object');
  }
  const { access_token, expires_in } = body as Record<string, unknown>;
  if (typeof access_token !== 'string' || typeof expires_in !== 'number') {
    throw new Error(
      'Kick token response is missing access_token or expires_in',
    );
  }
  return { accessToken: access_token, expiresIn: expires_in };
}

export function createKickTokenProvider(
  options: KickTokenOptions,
): () => Promise<string> {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;

  let cached: CachedToken | null = null;
  let inFlight: Promise<string> | null = null;

  async function requestToken(): Promise<string> {
    const response = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: options.clientId,
        client_secret: options.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Kick token request failed with HTTP ${response.status}`);
    }

    const { accessToken, expiresIn } = parseTokenResponse(
      await response.json(),
    );
    cached = { value: accessToken, expiresAt: now() + expiresIn * 1000 };
    return accessToken;
  }

  return async function getToken(): Promise<string> {
    if (cached && now() < cached.expiresAt - REFRESH_MARGIN_MS) {
      return cached.value;
    }
    inFlight ??= requestToken().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
