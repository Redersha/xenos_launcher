import * as fs from 'fs';
import * as path from 'path';
import { ModLoaderType, ModLoaderVersion, ModLoaderInfo } from '../types/modloader.js';
import { fetchFabricLoaderVersions, getFabricVersionId, getFabricVersionJson } from './fabric.js';
import { fetchQuiltLoaderVersions, getQuiltVersionId, getQuiltVersionJson } from './quilt.js';
import { fetchForgeVersions, getForgeVersionId, installForge } from './forge.js';
import { fetchNeoForgeVersions, getNeoForgeVersionId, installNeoForge } from './neoforge.js';
import { PATHS } from '../store/paths.js';
import { mkdirp } from 'mkdirp';
import { downloadWithProgress, DownloadTask, DownloadProgress } from '../download/downloader.js';

export type { ModLoaderType, ModLoaderVersion, ModLoaderInfo };

export async function fetchLoaderVersions(
  type: ModLoaderType,
  gameVersion: string,
): Promise<ModLoaderVersion[]> {
  switch (type) {
    case 'fabric': return fetchFabricLoaderVersions(gameVersion);
    case 'forge': return fetchForgeVersions(gameVersion);
    case 'neoforge': return fetchNeoForgeVersions(gameVersion);
    case 'quilt': return fetchQuiltLoaderVersions(gameVersion);
  }
}

export function getLoaderVersionId(type: ModLoaderType, gameVersion: string, loaderVersion: string): string {
  switch (type) {
    case 'fabric': return getFabricVersionId(gameVersion, loaderVersion);
    case 'forge': return getForgeVersionId(gameVersion, loaderVersion);
    case 'neoforge': return getNeoForgeVersionId(gameVersion, loaderVersion);
    case 'quilt': return getQuiltVersionId(gameVersion, loaderVersion);
  }
}

/**
 * Install a mod loader into the versions directory.
 * For Fabric/Quilt: Downloads the version JSON from their API.
 * For Forge/NeoForge: Downloads the installer and runs it.
 */
export async function installModLoader(
  type: ModLoaderType,
  gameVersion: string,
  loaderVersion: string,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const versionId = getLoaderVersionId(type, gameVersion, loaderVersion);
  const versionDir = path.join(PATHS.versions, versionId);
  const versionJsonPath = path.join(versionDir, `${versionId}.json`);

  // Already installed
  if (fs.existsSync(versionJsonPath)) {
    return versionId;
  }

  await mkdirp(versionDir);

  if (type === 'fabric') {
    onProgress?.('Downloading Fabric loader profile...');
    const versionJson = await getFabricVersionJson(gameVersion, loaderVersion);
    fs.writeFileSync(versionJsonPath, JSON.stringify(versionJson, null, 2), 'utf-8');

    // Download Maven libraries for Fabric
    onProgress?.('Downloading Fabric libraries...');
    await downloadMavenLibraries(versionJson.libraries || []);
  } else if (type === 'quilt') {
    onProgress?.('Downloading Quilt loader profile...');
    const versionJson = await getQuiltVersionJson(gameVersion, loaderVersion);
    fs.writeFileSync(versionJsonPath, JSON.stringify(versionJson, null, 2), 'utf-8');

    onProgress?.('Downloading Quilt libraries...');
    await downloadMavenLibraries(versionJson.libraries || []);
  } else if (type === 'forge') {
    onProgress?.('Installing Forge (this may take a while)...');
    // Find Java for Forge installer
    const javaPath = await findJavaForInstaller();
    await installForge(gameVersion, loaderVersion, PATHS.versions, PATHS.libraries, javaPath);
  } else if (type === 'neoforge') {
    onProgress?.('Installing NeoForge (this may take a while)...');
    const javaPath = await findJavaForInstaller();
    await installNeoForge(gameVersion, loaderVersion, PATHS.versions, PATHS.libraries, javaPath);
  }

  return versionId;
}

/**
 * Download libraries that use Maven coordinates instead of direct download URLs.
 * Fabric/Quilt libraries use the `url` field to specify the Maven repository.
 */
async function downloadMavenLibraries(libraries: any[]): Promise<void> {
  const tasks: DownloadTask[] = [];

  for (const lib of libraries) {
    // Skip libraries that already have downloads.artifact
    if (lib.downloads?.artifact?.url) continue;

    const name = lib.name as string;
    if (!name) continue;

    const mavenInfo = parseMavenName(name);
    if (!mavenInfo) continue;

    const { group, artifact, version } = mavenInfo;
    const relPath = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
    const destPath = path.join(PATHS.libraries, relPath);

    // Skip if already downloaded and valid (check size if available)
    if (fs.existsSync(destPath) && lib.size) {
      const existingSize = fs.statSync(destPath).size;
      if (existingSize === lib.size) continue;
    } else if (fs.existsSync(destPath) && !lib.size) {
      // No size info, assume it's valid if exists
      continue;
    }

    // Get repository URL from the library's `url` field
    const repoUrl = (lib.url as string) || 'https://maven.minecraftforge.net/';
    const downloadUrl = `${repoUrl}${relPath}`;

    tasks.push({
      url: downloadUrl,
      dest: destPath,
      name: `${artifact}-${version}.jar`,
      size: lib.size,
      sha1: lib.sha1,
    });
  }

  if (tasks.length > 0) {
    await downloadWithProgress(tasks, 4);
  }
}

function parseMavenName(name: string): { group: string; artifact: string; version: string } | null {
  const parts = name.split(':');
  if (parts.length < 3) return null;
  return { group: parts[0], artifact: parts[1], version: parts[2] };
}

async function findJavaForInstaller(): Promise<string> {
  // Try to find any Java on the system
  const { findBestJava } = await import('../java/detector.js');
  const javaInstall = await findBestJava(17);
  if (javaInstall) return javaInstall.path;
  return 'java';
}

/**
 * Auto-download Fabric API mod if the loader is Fabric.
 */
export async function downloadFabricApi(gameVersion: string, modsDir: string): Promise<void> {
  if (!fs.existsSync(modsDir)) {
    fs.mkdirSync(modsDir, { recursive: true });
  }

  // Use Modrinth API to find the latest compatible Fabric API
  try {
    const axios = (await import('axios')).default;
    const resp = await axios.get('https://api.modrinth.com/v2/project/P7dR8mSH/version', {
      params: {
        game_versions: `["${gameVersion}"]`,
        loaders: '["fabric"]',
      },
      timeout: 15000,
    });

    const versions = resp.data;
    if (versions && versions.length > 0) {
      const latestVersion = versions[0];
      const primaryFile = latestVersion.files?.find((f: any) => f.primary) || latestVersion.files?.[0];
      if (primaryFile) {
        const fileName = primaryFile.filename as string;
        const downloadUrl = primaryFile.url as string;
        const destPath = path.join(modsDir, fileName);

        if (!fs.existsSync(destPath)) {
          const fileResp = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 30000 });
          fs.writeFileSync(destPath, fileResp.data);
        }
      }
    }
  } catch {
    // Fabric API download is optional, don't fail the installation
  }
}
