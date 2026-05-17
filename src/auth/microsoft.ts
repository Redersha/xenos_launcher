import axios from 'axios';
import { PublicClientApplication, DeviceCodeRequest } from '@azure/msal-node';
import { AuthAccount, MicrosoftAuthResult } from '../types/auth.js';

// Minecraft auth endpoints
const XBL_AUTH_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_AUTH_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const MINECRAFT_LOGIN_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const MINECRAFT_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';

// Azure app registration for Minecraft launchers (public client)
const CLIENT_ID = 'c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb';

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: 'https://login.microsoftonline.com/consumers',
  },
};

const pca = new PublicClientApplication(msalConfig);

// Scopes needed for Minecraft auth
const SCOPES = ['XboxLive.signin', 'offline_access'];

export async function authenticateWithDeviceCode(
  onCode: (code: string, verificationUri: string, message: string) => void
): Promise<MicrosoftAuthResult> {
  const deviceCodeRequest: DeviceCodeRequest = {
    scopes: SCOPES,
    deviceCodeCallback: (response) => {
      onCode(response.userCode, response.verificationUri, response.message);
    },
  };

  const msalResponse = await pca.acquireTokenByDeviceCode(deviceCodeRequest);
  if (!msalResponse || !msalResponse.accessToken) {
    throw new Error('Failed to acquire Microsoft token. The device code may have expired. Please try again.');
  }

  const msAccessToken = msalResponse.accessToken;
  // Store MSAL account identifiers for refresh lookups
  const msHomeAccountId = msalResponse.account?.homeAccountId || '';
  const msLocalAccountId = msalResponse.account?.localAccountId || '';
  const msUsername = msalResponse.account?.username || '';

  // Step 1: Authenticate with Xbox Live
  const xblResponse = await authenticateXBL(msAccessToken);

  // Step 2: Get XSTS token
  const xstsResponse = await authenticateXSTS(xblResponse.Token, xblResponse.DisplayClaims.xui[0].uhs);

  // Step 3: Get Minecraft token
  const mcToken = await authenticateMinecraft(xstsResponse.Token, xstsResponse.DisplayClaims.xui[0].uhs);

  // Step 4: Get Minecraft profile
  const profile = await getMinecraftProfile(mcToken.access_token);

  return {
    accessToken: mcToken.access_token,
    // Store MSAL account identifiers for later refresh lookup
    refreshToken: JSON.stringify({
      homeAccountId: msHomeAccountId,
      localAccountId: msLocalAccountId,
      username: msUsername,
    }),
    expiresAt: Date.now() + (msalResponse.expiresOn?.getTime() || Date.now() + 3600000) - Date.now(),
    username: profile.name,
    uuid: profile.id,
  };
}

async function authenticateXBL(msAccessToken: string): Promise<any> {
  const response = await axios.post(XBL_AUTH_URL, {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: `d=${msAccessToken}`,
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT',
  }, {
    headers: { 'Content-Type': 'application/json' },
  });
  return response.data;
}

async function authenticateXSTS(xblToken: string, userHash: string): Promise<any> {
  const response = await axios.post(XSTS_AUTH_URL, {
    Properties: {
      SandboxId: 'RETAIL',
      UserTokens: [xblToken],
    },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT',
  }, {
    headers: { 'Content-Type': 'application/json' },
  });
  return response.data;
}

async function authenticateMinecraft(xstsToken: string, userHash: string): Promise<any> {
  const response = await axios.post(MINECRAFT_LOGIN_URL, {
    identityToken: `XBL3.0 x=${userHash};${xstsToken}`,
  }, {
    headers: { 'Content-Type': 'application/json' },
  });
  return response.data;
}

async function getMinecraftProfile(accessToken: string): Promise<{ id: string; name: string }> {
  const response = await axios.get(MINECRAFT_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data;
}

export function createMicrosoftAccount(result: MicrosoftAuthResult): AuthAccount {
  return {
    id: `microsoft_${result.uuid}`,
    type: 'microsoft',
    username: result.username,
    uuid: result.uuid,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
  };
}

export async function refreshMicrosoftToken(account: AuthAccount): Promise<AuthAccount> {
  if (!account.refreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    // Parse MSAL account info from stored token data
    let msalAccountInfo: { homeAccountId: string; localAccountId: string; username: string };
    try {
      msalAccountInfo = JSON.parse(account.refreshToken);
    } catch {
      throw new Error('Invalid stored token format. Please re-authenticate.');
    }

    // Try to find the cached account using getAllAccounts
    const allAccounts = await pca.getTokenCache().getAllAccounts();
    const cachedAccount = allAccounts.find(
      (a: any) => a.homeAccountId === msalAccountInfo.homeAccountId
    );

    if (cachedAccount) {
      // Use cached account for silent token acquisition
      const silentRequest = {
        scopes: SCOPES,
        account: cachedAccount,
      };

      const msalResponse = await pca.acquireTokenSilent(silentRequest);
      if (msalResponse?.accessToken) {
        const xblResponse = await authenticateXBL(msalResponse.accessToken);
        const xstsResponse = await authenticateXSTS(xblResponse.Token, xblResponse.DisplayClaims.xui[0].uhs);
        const mcToken = await authenticateMinecraft(xstsResponse.Token, xstsResponse.DisplayClaims.xui[0].uhs);
        const profile = await getMinecraftProfile(mcToken.access_token);

        return {
          ...account,
          accessToken: mcToken.access_token,
          username: profile.name,
          uuid: profile.id,
          expiresAt: Date.now() + 3600000,
        };
      }
    }

    // If silent refresh failed, throw to indicate re-authentication is needed
    throw new Error('Silent refresh failed. Please re-authenticate using device code flow.');
  } catch (error) {
    throw new Error(`Failed to refresh Microsoft token: ${error instanceof Error ? error.message : error}. Please re-authenticate.`);
  }
}
