import axios from 'axios';
import { ModLoaderVersion, ModLoaderType } from '../types/modloader.js';

const FABRIC_META_URL = 'https://meta.fabricmc.net/v2/versions/loader';

interface FabricLoaderEntry {
  separator: string;
  build: number;
  maven: string;
  version: string;
  stable: boolean;
}

export async function fetchFabricLoaderVersions(gameVersion: string): Promise<ModLoaderVersion[]> {
  try {
    const resp = await axios.get<FabricLoaderEntry[]>(`${FABRIC_META_URL}/${gameVersion}`, {
      timeout: 15000,
    });
    return resp.data.map(entry => ({
      type: 'fabric' as ModLoaderType,
      version: entry.version,
      gameVersion,
      stable: entry.stable,
    }));
  } catch {
    return [];
  }
}

export function getFabricVersionId(gameVersion: string, loaderVersion: string): string {
  return `fabric-loader-${loaderVersion}-${gameVersion}`;
}

export async function getFabricVersionJson(gameVersion: string, loaderVersion: string): Promise<any> {
  const url = `${FABRIC_META_URL}/${gameVersion}/${loaderVersion}/profile/json`;
  const resp = await axios.get(url, { timeout: 15000 });
  return resp.data;
}
