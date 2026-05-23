import axios from 'axios';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ModLoaderVersion, ModLoaderType } from '../types/modloader.js';
import { mkdirp } from 'mkdirp';

const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';

export async function fetchNeoForgeVersions(gameVersion: string): Promise<ModLoaderVersion[]> {
  try {
    const url = `${NEOFORGE_MAVEN}/maven-metadata.xml`;
    const resp = await axios.get(url, { timeout: 15000 });
    const xml = resp.data as string;
    const versionRegex = /<version>([^<]+)<\/version>/g;
    const versions: ModLoaderVersion[] = [];
    let match;

    // NeoForge version format: "20.4.167" for MC 1.20.4, "21.0.167" for MC 1.21.0
    const majorMinor = gameVersion.split('.').slice(0, 2).join('.');
    // e.g. "1.20" -> "20", "1.21" -> "21"
    const neoForgeMajorPrefix = gameVersion.replace('1.', '').split('.')[0] + '.';

    while ((match = versionRegex.exec(xml)) !== null) {
      const ver = match[1];
      if (ver.startsWith(neoForgeMajorPrefix)) {
        versions.push({
          type: 'neoforge' as ModLoaderType,
          version: ver,
          gameVersion,
          stable: !ver.includes('-beta') && !ver.includes('-alpha'),
        });
      }
    }

    // Return the latest versions (limited)
    return versions.slice(-20);
  } catch {
    return [];
  }
}

export function getNeoForgeVersionId(gameVersion: string, neoForgeVersion: string): string {
  return `neoforge-${gameVersion}-${neoForgeVersion}`;
}

export async function installNeoForge(
  gameVersion: string,
  neoForgeVersion: string,
  versionsDir: string,
  librariesDir: string,
  javaPath: string,
): Promise<string> {
  const versionId = getNeoForgeVersionId(gameVersion, neoForgeVersion);
  const versionDir = path.join(versionsDir, versionId);

  if (fs.existsSync(path.join(versionDir, `${versionId}.json`))) {
    return versionId;
  }

  // Download NeoForge installer
  const installerUrl = `${NEOFORGE_MAVEN}/${neoForgeVersion}/neoforge-${neoForgeVersion}-installer.jar`;
  const installerPath = path.join(versionDir, 'neoforge-installer.jar');

  await mkdirp(versionDir);

  const resp = await axios.get(installerUrl, { responseType: 'arraybuffer', timeout: 60000 });
  fs.writeFileSync(installerPath, resp.data);

  // Run NeoForge installer
  try {
    execSync(`"${javaPath}" -jar "${installerPath}" --installServer "${versionDir}"`, {
      timeout: 120000,
      stdio: 'pipe',
    });
  } catch {
    // If install fails, try to extract version JSON directly
  }

  // Look for version JSON
  const findJsonRecursive = (dir: string): string | null => {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const result = findJsonRecursive(fullPath);
          if (result) return result;
        } else if (entry.endsWith('.json') && (entry.includes('neoforge') || entry.includes('forge'))) {
          return fullPath;
        }
      } catch { /* ignore */ }
    }
    return null;
  };

  const jsonPath = findJsonRecursive(versionDir);
  if (jsonPath && jsonPath !== path.join(versionDir, `${versionId}.json`)) {
    const destPath = path.join(versionDir, `${versionId}.json`);
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(jsonPath, destPath);
    }
  }

  try { fs.unlinkSync(installerPath); } catch { /* ignore */ }

  return versionId;
}
