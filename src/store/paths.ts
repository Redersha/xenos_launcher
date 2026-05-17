import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { mkdirp } from 'mkdirp';

function getBaseDir(): string {
  const platform = os.platform();
  const home = os.homedir();
  switch (platform) {
    case 'win32':
      return path.join(home, 'AppData', 'Roaming', '.xenos-launcher');
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'xenos-launcher');
    default:
      return path.join(home, '.xenos-launcher');
  }
}

const BASE_DIR = getBaseDir();

export const PATHS = {
  base: BASE_DIR,
  versions: path.join(BASE_DIR, 'versions'),
  libraries: path.join(BASE_DIR, 'libraries'),
  assets: path.join(BASE_DIR, 'assets'),
  instances: path.join(BASE_DIR, 'instances'),
  java: path.join(BASE_DIR, 'java'),
  configFile: path.join(BASE_DIR, 'config.json'),
  accountsFile: path.join(BASE_DIR, 'accounts.json'),
  instancesFile: path.join(BASE_DIR, 'instances.json'),
  versionManifest: path.join(BASE_DIR, 'version_manifest.json'),
  cacheDir: path.join(BASE_DIR, 'cache'),
};

export async function ensureDirectories(): Promise<void> {
  const dirs = [
    PATHS.base,
    PATHS.versions,
    PATHS.libraries,
    PATHS.assets,
    PATHS.instances,
    PATHS.java,
    PATHS.cacheDir,
  ];
  for (const dir of dirs) {
    await mkdirp(dir as string);
  }
}

export function getMinecraftDefaultDir(): string {
  const platform = os.platform();
  const home = os.homedir();
  switch (platform) {
    case 'win32':
      return path.join(home, 'AppData', 'Roaming', '.minecraft');
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'minecraft');
    default:
      return path.join(home, '.minecraft');
  }
}

export function getAssetIndexPath(assetId: string): string {
  return path.join(PATHS.assets, 'indexes', `${assetId}.json`);
}

export function getAssetObjectPath(hash: string): string {
  const prefix = hash.substring(0, 2);
  return path.join(PATHS.assets, 'objects', prefix, hash);
}

export function getVersionDir(versionId: string): string {
  return path.join(PATHS.versions, versionId);
}

export function getVersionJsonPath(versionId: string): string {
  return path.join(getVersionDir(versionId), `${versionId}.json`);
}

export function getVersionJarPath(versionId: string): string {
  return path.join(getVersionDir(versionId), `${versionId}.jar`);
}

export function getLibraryPath(libPath: string): string {
  return path.join(PATHS.libraries, libPath);
}

export function getInstanceDir(instanceId: string): string {
  return path.join(PATHS.instances, instanceId);
}

/** Per-instance game directory (the .minecraft equivalent with saves, resourcepacks, etc.) */
export function getInstanceGameDir(instanceId: string): string {
  return path.join(PATHS.instances, instanceId, '.minecraft');
}

export function getJavaInstallDir(distribution: string, version: number): string {
  return path.join(PATHS.java, `${distribution}-${version}`);
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
