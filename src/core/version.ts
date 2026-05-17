import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { VersionManifest, VersionEntry, VersionDetail } from '../types/minecraft.js';
import { PATHS, getVersionDir, getVersionJsonPath, readFileSafe, ensureDirectories } from '../store/paths.js';

const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

let cachedManifest: VersionManifest | null = null;

export async function getVersionManifest(forceRefresh = false): Promise<VersionManifest> {
  if (cachedManifest && !forceRefresh) return cachedManifest;

  // Try loading from cache first
  const cached = readFileSafe(PATHS.versionManifest);
  if (cached && !forceRefresh) {
    try {
      cachedManifest = JSON.parse(cached);
      return cachedManifest!;
    } catch { /* ignore */ }
  }

  const resp = await axios.get<VersionManifest>(VERSION_MANIFEST_URL, {
    timeout: 30000,
  });
  cachedManifest = resp.data;

  // Save to cache
  fs.writeFileSync(PATHS.versionManifest, JSON.stringify(cachedManifest, null, 2), 'utf-8');
  return cachedManifest;
}

export async function getVersionDetail(versionId: string): Promise<VersionDetail> {
  // Try local file first
  const localPath = getVersionJsonPath(versionId);
  if (fs.existsSync(localPath)) {
    const content = fs.readFileSync(localPath, 'utf-8');
    return JSON.parse(content);
  }

  // Find version URL from manifest
  const manifest = await getVersionManifest();
  const entry = manifest.versions.find(v => v.id === versionId);
  if (!entry) {
    throw new Error(`Version ${versionId} not found in manifest`);
  }

  const resp = await axios.get<VersionDetail>(entry.url, { timeout: 30000 });
  const detail = resp.data;

  // Save locally
  const dir = getVersionDir(versionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(localPath, JSON.stringify(detail, null, 2), 'utf-8');

  return detail;
}

export async function resolveVersionChain(versionId: string): Promise<VersionDetail[]> {
  const chain: VersionDetail[] = [];
  let currentId = versionId;

  while (currentId) {
    const detail = await getVersionDetail(currentId);
    chain.push(detail);
    currentId = detail.inheritsFrom || '';
  }

  return chain;
}

export async function getAvailableVersions(filter?: {
  type?: 'release' | 'snapshot' | 'all';
  minVersion?: string;
  maxVersion?: string;
}): Promise<VersionEntry[]> {
  const manifest = await getVersionManifest();
  let versions = manifest.versions;

  if (filter?.type && filter.type !== 'all') {
    versions = versions.filter(v => v.type === filter.type);
  }

  if (filter?.minVersion || filter?.maxVersion) {
    // Get all release versions to establish ordering
    const allReleases = manifest.versions.filter(v => v.type === 'release');
    const releaseIndex = new Map(allReleases.map((v, i) => [v.id, i]));

    versions = versions.filter(v => {
      const idx = releaseIndex.get(v.id);
      if (idx !== undefined) {
        let pass = true;
        if (filter.minVersion) {
          const minIdx = releaseIndex.get(filter.minVersion);
          if (minIdx !== undefined) pass = pass && idx >= minIdx;
        }
        if (filter.maxVersion) {
          const maxIdx = releaseIndex.get(filter.maxVersion);
          if (maxIdx !== undefined) pass = pass && idx <= maxIdx;
        }
        return pass;
      }
      // For snapshots, include them if they're between releases
      return true;
    });
  }

  return versions;
}

export function compareMcVersions(a: string, b: string): number {
  const parseVersion = (v: string): number[] => {
    // Remove any suffix like "-pre1" or "rc1"
    const parts = v.replace(/-.*$/, '').split('.').map(Number);
    return parts;
  };

  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }

  // Releases come before snapshots/pre-releases of the same version
  if (a.includes('-') && !b.includes('-')) return 1;
  if (!a.includes('-') && b.includes('-')) return -1;

  return a.localeCompare(b);
}
