import { createClient, type Row } from '@libsql/client/web';

// EXPO_PUBLIC_ vars are inlined by Metro at bundle time — reliable in both Expo Go and builds.
export const tursoClient = createClient({
  url: process.env.EXPO_PUBLIC_TURSO_URL ?? '',
  authToken: process.env.EXPO_PUBLIC_TURSO_AUTH_TOKEN ?? '',
});

export async function queryTurso(
  sql: string,
  args: (string | number | boolean | null)[],
): Promise<Row[]> {
  const response = await tursoClient.execute({ sql, args });
  return response.rows;
}
