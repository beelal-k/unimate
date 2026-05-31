import { createClient, type Client, type Row } from '@libsql/client/web';

// EXPO_PUBLIC_ vars are inlined by Metro at bundle time — reliable in both Expo Go and builds.
let _client: Client | null = null;

function getTursoClient(): Client | null {
  if (_client) return _client;

  const url = process.env.EXPO_PUBLIC_TURSO_URL;
  const authToken = process.env.EXPO_PUBLIC_TURSO_AUTH_TOKEN;

  if (!url) {
    console.warn(
      '[Turso] EXPO_PUBLIC_TURSO_URL is not set — remote sync disabled.',
    );
    return null;
  }

  try {
    _client = createClient({ url, authToken: authToken ?? '' });
    return _client;
  } catch (err) {
    console.warn('[Turso] Failed to create client:', err);
    return null;
  }
}

export async function queryTurso(
  sql: string,
  args: (string | number | boolean | null)[],
): Promise<Row[]> {
  const client = getTursoClient();
  if (!client) return [];
  const response = await client.execute({ sql, args });
  return response.rows;
}
