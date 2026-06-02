import axios, { AxiosInstance } from 'axios';
import { MoodleCredentials } from './types';

export function createMoodleClient({ siteUrl, token }: MoodleCredentials): AxiosInstance {
  const client = axios.create({
    baseURL: `${siteUrl}/webservice/rest/server.php`,
    timeout: 30000,
    params: {
      wstoken: token,
      moodlewsrestformat: 'json',
    },
  });

  client.interceptors.response.use((response) => {
    const data = response.data as Record<string, unknown>;
    if (data?.exception) {
      throw new Error((data.message as string) ?? (data.exception as string));
    }
    return response;
  });

  return client;
}
