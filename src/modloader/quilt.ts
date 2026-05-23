import axios from 'axios';
import { ModLoaderVersion, ModLoaderType } from '../types/modloader.js';

const QUILT_META_URL = 'https://meta.quiltmc.org/v3/versions/loader';

interface QuiltLoaderEntry {
  separator: string;
  build: number;
  maven: string;
  version: string;
  stable: boolean;
}

export async function fetchQuiltLoaderVersions(gameVersion: string): Promise<ModLoaderVersion[]> {
  try {
    const resp = await axios.get<QuiltLoaderEntry[]>(`${QUILT_META_URL}/${gameVersion}`, {
      timeout: 15000,
    });
    return resp.data.map(entry => ({
      type: 'quilt' as ModLoaderType,
      version: entry.version,
      gameVersion,
      stable: entry.stable,
    }));
  } catch {
    return [];
  }
}

export function getQuiltVersionId(gameVersion: string, loaderVersion: string): string {
  return `quilt-loader-${loaderVersion}-${gameVersion}`;
}

export async function getQuiltVersionJson(gameVersion: string, loaderVersion: string): Promise<any> {
  const url = `${QUILT_META_URL}/${gameVersion}/${loaderVersion}/profile/json`;
  const resp = await axios.get(url, { timeout: 15000 });
  return resp.data;
}
