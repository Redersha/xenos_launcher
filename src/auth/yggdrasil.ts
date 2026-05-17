import axios from 'axios';
import { AuthAccount, YggdrasilAuthResult, YggdrasilServer } from '../types/auth.js';

// Common Yggdrasil servers
export const DEFAULT_YGGDRASIL_SERVERS: YggdrasilServer[] = [
  {
    name: 'LittleSkin',
    url: 'https://littleskin.cn/api/yggdrasil',
    registerUrl: 'https://littleskin.cn/auth/register',
  },
  {
    name: 'Blessing Skin (Custom)',
    url: '',
    registerUrl: '',
  },
];

export async function authenticateYggdrasil(
  serverUrl: string,
  email: string,
  password: string
): Promise<YggdrasilAuthResult> {
  const url = `${serverUrl}/authserver/authenticate`;

  const response = await axios.post(url, {
    agent: {
      name: 'Minecraft',
      version: 1,
    },
    username: email,
    password: password,
    requestUser: true,
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  const data = response.data;

  if (!data.accessToken || !data.selectedProfile) {
    throw new Error('Authentication failed: invalid response from server');
  }

  return {
    accessToken: data.accessToken,
    username: data.selectedProfile.name,
    uuid: data.selectedProfile.id,
  };
}

export async function validateYggdrasilToken(
  serverUrl: string,
  accessToken: string
): Promise<boolean> {
  try {
    const url = `${serverUrl}/authserver/validate`;
    await axios.post(url, { accessToken }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function refreshYggdrasilToken(
  serverUrl: string,
  accessToken: string
): Promise<YggdrasilAuthResult> {
  const url = `${serverUrl}/authserver/refresh`;

  const response = await axios.post(url, {
    accessToken,
    requestUser: true,
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  const data = response.data;

  return {
    accessToken: data.accessToken,
    username: data.selectedProfile?.name || '',
    uuid: data.selectedProfile?.id || '',
  };
}

export function createYggdrasilAccount(
  serverUrl: string,
  serverName: string,
  result: YggdrasilAuthResult
): AuthAccount {
  return {
    id: `yggdrasil_${serverName}_${result.uuid}`,
    type: 'yggdrasil',
    username: result.username,
    uuid: result.uuid,
    accessToken: result.accessToken,
    serverUrl,
    serverName,
  };
}
