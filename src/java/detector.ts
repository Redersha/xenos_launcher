import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JavaInstallation } from '../types/java.js';
import { PATHS, getJavaInstallDir } from '../store/paths.js';
import { getRecommendedJavaVersion, isJavaCompatible } from './versions.js';

/**
 * Scan the system for installed Java versions.
 */
export async function detectJavaInstallations(): Promise<JavaInstallation[]> {
  const installations: JavaInstallation[] = [];
  const seen = new Set<string>();

  // 1. Scan PATH
  const pathJava = await findJavaInPath();
  for (const inst of pathJava) {
    if (!seen.has(inst.path)) {
      seen.add(inst.path);
      installations.push(inst);
    }
  }

  // 2. Scan platform-specific default locations
  const platformJava = await findJavaInPlatformPaths();
  for (const inst of platformJava) {
    if (!seen.has(inst.path)) {
      seen.add(inst.path);
      installations.push(inst);
    }
  }

  // 3. Scan our own managed JDK directory
  const managedJava = await findJavaInManagedDir();
  for (const inst of managedJava) {
    if (!seen.has(inst.path)) {
      seen.add(inst.path);
      installations.push(inst);
    }
  }

  return installations.sort((a, b) => b.version - a.version);
}

/**
 * Find the best Java installation for a given required version.
 */
export async function findBestJava(requiredVersion: number): Promise<JavaInstallation | null> {
  const installations = await detectJavaInstallations();

  // First, try exact match
  const exact = installations.find(i => i.version === requiredVersion);
  if (exact) return exact;

  // Try compatible version (>= required, up to +4)
  const compatible = installations.find(i => i.version >= requiredVersion && i.version <= requiredVersion + 4);
  if (compatible) return compatible;

  // No compatible Java found — do NOT fall back to incompatible versions
  return null;
}

/**
 * Delete a managed JDK installation by removing its install directory.
 * Only works for managed (auto-installed) JDKs under PATHS.java.
 * Returns true if deleted, false if not a managed JDK or deletion failed.
 */
export function deleteManagedJdk(installPath: string): boolean {
  // Resolve the JDK root dir from the java binary path
  // e.g. .../java/azul-21/bin/java -> .../java/azul-21
  const binDir = path.dirname(installPath);
  const jdkRoot = path.dirname(binDir);

  // Safety: only allow deletion under PATHS.java
  if (!jdkRoot.startsWith(PATHS.java)) return false;

  try {
    if (fs.existsSync(jdkRoot)) {
      fs.rmSync(jdkRoot, { recursive: true, force: true });
      return true;
    }
  } catch { /* ignore */ }

  return false;
}

async function findJavaInPath(): Promise<JavaInstallation[]> {
  const results: JavaInstallation[] = [];
  const javaNames = os.platform() === 'win32' ? ['java.exe', 'javaw.exe'] : ['java'];

  const pathEnv = process.env.PATH || '';
  const pathDirs = pathEnv.split(path.delimiter);

  for (const dir of pathDirs) {
    for (const name of javaNames) {
      const javaPath = path.join(dir, name);
      if (fs.existsSync(javaPath)) {
        const info = await getJavaInfo(javaPath);
        if (info) {
          results.push(info);
        }
      }
    }
  }

  return results;
}

async function findJavaInPlatformPaths(): Promise<JavaInstallation[]> {
  const results: JavaInstallation[] = [];
  const platform = os.platform();
  const home = os.homedir();

  let searchPaths: string[] = [];

  if (platform === 'darwin') {
    searchPaths = [
      '/Library/Java/JavaVirtualMachines',
      path.join(home, 'Library/Java/JavaVirtualMachines'),
    ];
  } else if (platform === 'linux') {
    searchPaths = [
      '/usr/lib/jvm',
      '/usr/java',
      '/opt/java',
      '/opt/jdk',
      path.join(home, '.sdkman/candidates/java'),
    ];
  } else if (platform === 'win32') {
    searchPaths = [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Java'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Eclipse Adoptium'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Zulu'),
    ];
  }

  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) continue;

    try {
      const entries = fs.readdirSync(searchPath);
      for (const entry of entries) {
        const javaBin = platform === 'win32'
          ? path.join(searchPath, entry, 'bin', 'java.exe')
          : path.join(searchPath, entry, 'Contents', 'Home', 'bin', 'java');

        // Also try without Contents/Home on Linux
        const altBin = path.join(searchPath, entry, 'bin', 'java');

        for (const binPath of [javaBin, altBin]) {
          if (fs.existsSync(binPath)) {
            const info = await getJavaInfo(binPath);
            if (info) {
              results.push(info);
            }
          }
        }
      }
    } catch { /* ignore permission errors */ }
  }

  return results;
}

async function findJavaInManagedDir(): Promise<JavaInstallation[]> {
  const results: JavaInstallation[] = [];
  if (!fs.existsSync(PATHS.java)) return results;

  try {
    const entries = fs.readdirSync(PATHS.java);
    for (const entry of entries) {
      const javaBin = os.platform() === 'win32'
        ? path.join(PATHS.java, entry, 'bin', 'java.exe')
        : path.join(PATHS.java, entry, 'bin', 'java');

      if (fs.existsSync(javaBin)) {
        const info = await getJavaInfo(javaBin);
        if (info) {
          info.isAutoInstalled = true;
          results.push(info);
        }
      }
    }
  } catch { /* ignore */ }

  return results;
}

async function getJavaInfo(javaPath: string): Promise<JavaInstallation | null> {
  try {
    const output = child_process.execSync(`"${javaPath}" -version 2>&1`, {
      encoding: 'utf-8',
      timeout: 5000,
    });

    const versionMatch = output.match(/version "(\d+)(?:\.(\d+))?.*"/);
    if (!versionMatch) return null;

    let majorVersion: number;
    if (versionMatch[1] === '1') {
      // Java 8 format: 1.8.x_xxx
      majorVersion = parseInt(versionMatch[2] || '8');
    } else {
      // Java 9+ format: 11.x.x, 17.x.x, 21.x.x
      majorVersion = parseInt(versionMatch[1]);
    }

    // Detect distribution
    const dist = detectDistribution(output, javaPath);

    return {
      path: javaPath,
      version: majorVersion,
      distribution: dist,
      arch: process.arch,
    };
  } catch {
    return null;
  }
}

function detectDistribution(versionOutput: string, javaPath: string): string {
  const lower = versionOutput.toLowerCase();
  const pathLower = javaPath.toLowerCase();

  if (lower.includes('azul') || pathLower.includes('zulu')) return 'azul';
  if (lower.includes('oracle') || pathLower.includes('oracle')) return 'oracle';
  if (lower.includes('adoptium') || pathLower.includes('adoptium') || lower.includes('temurin') || pathLower.includes('temurin')) return 'adoptium';
  if (lower.includes('microsoft') || pathLower.includes('microsoft')) return 'microsoft';
  if (lower.includes('amazon') || pathLower.includes('amazon') || lower.includes('corretto') || pathLower.includes('corretto')) return 'amazon';
  if (lower.includes('openjdk')) return 'openjdk';

  return 'unknown';
}
