import { JDK_VERSION_MAPPINGS, JdkVersionMapping } from '../types/java.js';

/**
 * Determine the recommended Java version for a given Minecraft version.
 */
export function getRecommendedJavaVersion(mcVersion: string): number {
  const mapping = findMapping(mcVersion);
  return mapping?.recommendedJava || 17;
}

/**
 * Determine the minimum Java version for a given Minecraft version.
 */
export function getMinJavaVersion(mcVersion: string): number {
  const mapping = findMapping(mcVersion);
  return mapping?.minJava || 8;
}

/**
 * Determine the maximum Java version for a given Minecraft version.
 */
export function getMaxJavaVersion(mcVersion: string): number {
  const mapping = findMapping(mcVersion);
  return mapping?.maxJava || 24;
}

/**
 * Check if a specific Java version is compatible with a Minecraft version.
 */
export function isJavaCompatible(mcVersion: string, javaVersion: number): boolean {
  const mapping = findMapping(mcVersion);
  if (!mapping) return javaVersion >= 17;
  return javaVersion >= mapping.minJava && javaVersion <= mapping.maxJava;
}

function findMapping(mcVersion: string): JdkVersionMapping | undefined {
  // Normalize version for comparison
  const normalized = normalizeVersion(mcVersion);

  for (const mapping of JDK_VERSION_MAPPINGS) {
    const min = normalizeVersion(mapping.minMcVersion);
    const max = normalizeVersion(mapping.maxMcVersion);

    if (compareVersions(normalized, min) >= 0 && compareVersions(normalized, max) <= 0) {
      return mapping;
    }
  }

  // Default: for very new versions, use the last mapping
  return JDK_VERSION_MAPPINGS[JDK_VERSION_MAPPINGS.length - 1];
}

function normalizeVersion(v: string): number[] {
  // Remove snapshot suffixes like "1.21.5-rc1" or "25w02a"
  const match = v.match(/^(\d+\.\d+(?:\.\d+)?)/);
  if (match) {
    return match[1].split('.').map(Number);
  }
  // For snapshot versions like "25w02a", parse the year/week
  const snapMatch = v.match(/^(\d{2})w(\d{2})/);
  if (snapMatch) {
    return [2000 + parseInt(snapMatch[1]), parseInt(snapMatch[2])];
  }
  // Pre-classic / classic / old_alpha versions (rd-*, c0.*, a0.*, b0.*)
  // These are very old versions that need Java 8
  if (/^(rd-|c0\.|a0\.|b0\.|inf-|in-)/.test(v)) {
    return [0, 0];
  }
  return [0];
}

function compareVersions(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const na = a[i] || 0;
    const nb = b[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}
