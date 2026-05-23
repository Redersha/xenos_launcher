import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { mkdirp } from 'mkdirp';

// CurseForge requires an API key. This is a simplified client.
// Users need to provide their own API key in settings.

const CURSEFORGE_API = 'https://api.curseforge.com/v1';

export interface CurseForgeMod {
  id: number;
  name: string;
  summary: string;
  downloadCount: number;
  categories: { name: string; iconUrl: string }[];
  dateModified: string;
  latestFiles: CurseForgeFile[];
}

export interface CurseForgeFile {
  id: number;
  displayName: string;
  fileName: string;
  downloadUrl: string;
  fileDate: string;
  fileLength: number;
  releaseType: number;
  gameVersions: string[];
  dependencies: { modId: number; relationType: number }[];
}

export async function searchMods(
  apiKey: string,
  query: string,
  options?: {
    gameVersion?: string;
    modLoader?: number; // 1=Forge, 4=Fabric, 5=Quilt, 6=NeoForge
    sortOrder?: string;
    categoryId?: number;
    offset?: number;
    limit?: number;
  },
): Promise<{ data: CurseForgeMod[]; pagination: { totalCount: number } }> {
  const params: Record<string, string | number> = {
    gameId: 432, // Minecraft
    searchFilter: query,
    sortOrder: options?.sortOrder || 'Desc',
    pageSize: options?.limit || 20,
    index: options?.offset || 0,
  };

  if (options?.gameVersion) params.gameVersion = options.gameVersion;
  if (options?.modLoader) params.modLoaderType = options.modLoader;
  if (options?.categoryId) params.categoryId = options.categoryId;

  const resp = await axios.get(`${CURSEFORGE_API}/mods/search`, {
    params,
    headers: { 'x-api-key': apiKey },
    timeout: 15000,
  });

  return resp.data;
}

export async function getModFiles(
  apiKey: string,
  modId: number,
  gameVersion?: string,
): Promise<CurseForgeFile[]> {
  const params: Record<string, string> = {};
  if (gameVersion) params.gameVersion = gameVersion;

  const resp = await axios.get(`${CURSEFORGE_API}/mods/${modId}/files`, {
    params: Object.keys(params).length > 0 ? params : undefined,
    headers: { 'x-api-key': apiKey },
    timeout: 15000,
  });

  return resp.data.data;
}

export async function downloadModFile(
  file: CurseForgeFile,
  modsDir: string,
): Promise<string> {
  if (!fs.existsSync(modsDir)) {
    await mkdirp(modsDir);
  }

  const destPath = path.join(modsDir, file.fileName);
  if (fs.existsSync(destPath)) return destPath;

  const resp = await axios.get(file.downloadUrl, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  fs.writeFileSync(destPath, resp.data);

  return destPath;
}
