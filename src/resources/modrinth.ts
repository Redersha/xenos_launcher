import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { mkdirp } from 'mkdirp';

const MODRINTH_API = 'https://api.modrinth.com/v2';

export interface ModrinthProject {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  project_type: string;
  downloads: number;
  icon_url?: string;
  date_modified: string;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: ModrinthFile[];
  changelog?: string;
  date_published: string;
}

export interface ModrinthFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  sha1?: string;
}

export interface ModrinthSearchResult {
  hits: ModrinthProject[];
  offset: number;
  limit: number;
  total_hits: number;
}

export async function searchMods(
  query: string,
  options?: {
    gameVersion?: string;
    modLoader?: string;
    categories?: string[];
    sortBy?: 'relevance' | 'downloads' | 'updated';
    offset?: number;
    limit?: number;
  },
): Promise<ModrinthSearchResult> {
  const facets: string[][] = [['project_type:mod']];

  if (options?.gameVersion) {
    facets.push([`versions:${options.gameVersion}`]);
  }
  if (options?.modLoader) {
    facets.push([`categories:${options.modLoader}`]);
  }
  if (options?.categories && options.categories.length > 0) {
    facets.push(options.categories.map(c => `categories:${c}`));
  }

  const params: Record<string, string> = {
    query,
    facets: JSON.stringify(facets),
    limit: String(options?.limit || 20),
    offset: String(options?.offset || 0),
  };

  if (options?.sortBy) {
    const sortMap: Record<string, string> = {
      relevance: 'relevance',
      downloads: 'downloads',
      updated: 'updated',
    };
    params.index = sortMap[options.sortBy] || 'relevance';
  }

  const resp = await axios.get<ModrinthSearchResult>(`${MODRINTH_API}/search`, {
    params,
    timeout: 15000,
  });

  return resp.data;
}

export async function getProject(projectId: string): Promise<ModrinthProject> {
  const resp = await axios.get<ModrinthProject>(`${MODRINTH_API}/project/${projectId}`, {
    timeout: 15000,
  });
  return resp.data;
}

export async function getProjectVersions(
  projectId: string,
  options?: {
    gameVersions?: string[];
    loaders?: string[];
  },
): Promise<ModrinthVersion[]> {
  const params: Record<string, string> = {};
  if (options?.gameVersions) {
    params.game_versions = JSON.stringify(options.gameVersions);
  }
  if (options?.loaders) {
    params.loaders = JSON.stringify(options.loaders);
  }

  const resp = await axios.get<ModrinthVersion[]>(`${MODRINTH_API}/project/${projectId}/version`, {
    params: Object.keys(params).length > 0 ? params : undefined,
    timeout: 15000,
  });
  return resp.data;
}

export async function downloadModFile(version: ModrinthVersion, modsDir: string): Promise<string> {
  if (!fs.existsSync(modsDir)) {
    await mkdirp(modsDir);
  }

  const primaryFile = version.files?.find(f => f.primary) || version.files?.[0];
  if (!primaryFile) throw new Error(t('resources.noDownloadableFile', 'zh-CN'));

  const destPath = path.join(modsDir, primaryFile.filename);

  if (fs.existsSync(destPath)) {
    return destPath; // Already downloaded
  }

  try {
    const resp = await axios.get(primaryFile.url, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    fs.writeFileSync(destPath, resp.data);
    return destPath;
  } catch (err: any) {
    if (err.response?.status === 404) {
      throw new Error(t('resources.download404', 'zh-CN'));
    }
    throw err;
  }
}

// Simple translation for download errors
function t(key: string, lang: string): string {
  const translations: Record<string, Record<string, string>> = {
    'zh-CN': {
      'resources.noDownloadableFile': '没有可下载的文件',
      'resources.download404': '下载链接已失效(404)，请尝试其他版本',
    },
    'en': {
      'resources.noDownloadableFile': 'No downloadable file found',
      'resources.download404': 'Download link expired (404), please try another version',
    },
  };
  return translations[lang]?.[key] || key;
}

/**
 * Get categories/facets from Modrinth for filtering.
 */
export async function getCategories(): Promise<{ name: string; project_type: string }[]> {
  try {
    const resp = await axios.get(`${MODRINTH_API}/tag/category`, { timeout: 10000 });
    return resp.data.filter((c: any) => c.project_type === 'mod');
  } catch {
    return [];
  }
}
