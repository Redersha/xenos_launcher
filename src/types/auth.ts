export type AuthType = 'offline' | 'microsoft' | 'yggdrasil';

export interface AuthAccount {
  id: string;
  type: AuthType;
  username: string;
  uuid: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  // Yggdrasil specific
  serverUrl?: string;
  serverName?: string;
}

export interface MicrosoftAuthResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  username: string;
  uuid: string;
}

export interface YggdrasilAuthResult {
  accessToken: string;
  username: string;
  uuid: string;
}

export interface YggdrasilServer {
  name: string;
  url: string;
  registerUrl?: string;
}
