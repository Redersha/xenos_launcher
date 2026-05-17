import * as crypto from 'crypto';
import { AuthAccount } from '../types/auth.js';

export function createOfflineAccount(username: string): AuthAccount {
  // Generate a deterministic UUID from the username for offline mode
  const uuid = generateOfflineUuid(username);

  return {
    id: `offline_${username.toLowerCase()}`,
    type: 'offline',
    username,
    uuid,
    accessToken: '0', // Offline doesn't need a real token
  };
}

function generateOfflineUuid(username: string): string {
  // Use Java's offline UUID algorithm: MD5("OfflinePlayer:" + name) with variant bits set
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest();
  // Set version to 3 (MD5) and variant to IETF
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.toString('hex');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}
