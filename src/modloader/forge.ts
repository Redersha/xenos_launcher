import axios from 'axios';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ModLoaderVersion, ModLoaderType } from '../types/modloader.js';
import { mkdirp } from 'mkdirp';

const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge';

interface ForgePromoData {
  homepage: string;
  promos: Record<string, string>;
}

export async function fetchForgeVersions(gameVersion: string): Promise<ModLoaderVersion[]> {
  try {
    const resp = await axios.get<ForgePromoData>(
      'https://maven.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
      { timeout: 15000, headers: { 'User-Agent': 'xenos-launcher' } },
    );
    const promos = resp.data.promos || {};
    const versions: ModLoaderVersion[] = [];

    for (const [key, value] of Object.entries(promos)) {
      // Keys are like "1.20.4-latest", "1.20.4-recommended"
      if (!key.startsWith(gameVersion)) continue;
      const versionStr = String(value);
      const existing = versions.find(v => v.version === versionStr);
      if (existing) {
        // Prefer truthful stable flag: if this entry says recommended, mark stable
        if (key.endsWith('-recommended')) existing.stable = true;
        continue;
      }
      versions.push({
        type: 'forge' as ModLoaderType,
        version: versionStr,
        gameVersion,
        stable: key.endsWith('-recommended'),
      });
    }

    // If no versions found from promos, try to get all versions for this game version
    if (versions.length === 0) {
      return await fetchForgeVersionsFromMaven(gameVersion);
    }

    return versions;
  } catch {
    return await fetchForgeVersionsFromMaven(gameVersion);
  }
}

async function fetchForgeVersionsFromMaven(gameVersion: string): Promise<ModLoaderVersion[]> {
  try {
    const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${gameVersion}/maven-metadata.xml`;
    const resp = await axios.get(url, { timeout: 15000 });
    const xml = resp.data as string;
    const versionRegex = /<version>([^<]+)<\/version>/g;
    const versions: ModLoaderVersion[] = [];
    let match;
    while ((match = versionRegex.exec(xml)) !== null) {
      const ver = match[1];
      // Version format: "1.20.4-49.0.26" or "1.20.4-49.0.26"
      const forgeVer = ver.replace(`${gameVersion}-`, '');
      if (forgeVer && forgeVer !== gameVersion) {
        versions.push({
          type: 'forge' as ModLoaderType,
          version: forgeVer,
          gameVersion,
          stable: true,
        });
      }
    }
    return versions;
  } catch {
    return [];
  }
}

export function getForgeVersionId(gameVersion: string, forgeVersion: string): string {
  return `forge-${gameVersion}-${forgeVersion}`;
}

export async function installForge(
  gameVersion: string,
  forgeVersion: string,
  versionsDir: string,
  librariesDir: string,
  javaPath: string,
): Promise<string> {
  const versionId = getForgeVersionId(gameVersion, forgeVersion);
  const versionDir = path.join(versionsDir, versionId);

  // Check if already installed
  if (fs.existsSync(path.join(versionDir, `${versionId}.json`))) {
    return versionId;
  }

  // Download Forge installer
  const installerUrl = `${FORGE_MAVEN}/${gameVersion}-${forgeVersion}/forge-${gameVersion}-${forgeVersion}-installer.jar`;
  const installerPath = path.join(versionDir, 'forge-installer.jar');

  await mkdirp(versionDir);

  const resp = await axios.get(installerUrl, { responseType: 'arraybuffer', timeout: 60000 });
  fs.writeFileSync(installerPath, resp.data);

  // Run Forge installer in headless mode (extracts version JSON and libraries)
  try {
    execSync(`"${javaPath}" -jar "${installerPath}" --installServer "${versionDir}"`, {
      timeout: 120000,
      stdio: 'pipe',
    });
  } catch {
    // If headless install fails, try extracting just the version JSON
  }

  // Try to find and move the version JSON
  const possibleJsonNames = [
    path.join(versionDir, `${versionId}.json`),
    // Forge installer puts files in different locations depending on version
  ];

  // Look for version JSON in the install directory
  const findJsonRecursive = (dir: string): string | null => {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const result = findJsonRecursive(fullPath);
        if (result) return result;
      } else if (entry.endsWith('.json') && entry.includes('forge')) {
        return fullPath;
      }
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

  // Cleanup installer
  try { fs.unlinkSync(installerPath); } catch { /* ignore */ }

  return versionId;
}
