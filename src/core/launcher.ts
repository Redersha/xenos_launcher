import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { VersionDetail, Library, Rule, ArgumentEntry } from '../types/minecraft.js';
import { AuthAccount } from '../types/auth.js';
import { PATHS, getLibraryPath, getVersionJarPath, getVersionDir, fileExists } from '../store/paths.js';
import { resolveVersionChain } from './version.js';
import { findBestJava } from '../java/detector.js';
import { InstanceConfig } from '../types/instance.js';
import { processManager } from './processManager.js';

interface LaunchOptions {
  versionId: string;
  account: AuthAccount;
  instanceConfig: InstanceConfig;
  gameDir: string;
  instanceName?: string;
  instanceId?: string;
  accountId?: string;
  processPriority?: 'high' | 'medium' | 'low';
  autoRamAllocation?: boolean;
}

function evaluateRule(rule: Rule): boolean {
  const platform = process.platform;
  const arch = process.arch;

  if (rule.os) {
    if (rule.os.name) {
      const osMap: Record<string, string[]> = {
        windows: ['win32'],
        osx: ['darwin'],
        linux: ['linux'],
      };
      const match = osMap[rule.os.name]?.includes(platform) ?? false;
      if (!match) return rule.action === 'disallow';
    }
    if (rule.os.arch) {
      const archMap: Record<string, string> = {
        x86: 'ia32',
        x64: 'x64',
        arm64: 'arm64',
      };
      const match = archMap[rule.os.arch] === arch;
      if (!match) return rule.action === 'disallow';
    }
  }

  return rule.action === 'allow';
}

function shouldApplyLibrary(lib: Library): boolean {
  if (!lib.rules || lib.rules.length === 0) return true;
  return lib.rules.some(rule => evaluateRule(rule));
}

function getArguments(args: ArgumentEntry[]): string[] {
  const result: string[] = [];
  for (const arg of args) {
    if (typeof arg === 'string') {
      result.push(arg);
    } else if (arg.rules && arg.rules.length > 0) {
      if (arg.rules.some(rule => evaluateRule(rule))) {
        if (Array.isArray(arg.value)) {
          result.push(...arg.value);
        } else if (arg.value) {
          result.push(arg.value);
        }
      }
    } else {
      if (Array.isArray(arg.value)) {
        result.push(...arg.value);
      } else if (arg.value) {
        result.push(arg.value);
      }
    }
  }
  return result;
}

function getNativeClassifier(lib: Library): string | null {
  if (!lib.natives) return null;
  const platform = process.platform;
  const arch = process.arch;

  const osKey = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'osx' : 'linux';
  let classifier = lib.natives[osKey];
  if (!classifier) return null;

  if (platform === 'linux' && arch === 'arm64') {
    classifier = classifier.replace('${arch}', 'aarch64');
  } else {
    classifier = classifier.replace('${arch}', arch === 'x64' ? '64' : '32');
  }

  return classifier;
}

async function getLibraryPaths(details: VersionDetail[]): Promise<string[]> {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const detail of details) {
    for (const lib of detail.libraries) {
      if (!shouldApplyLibrary(lib)) continue;

      const nameKey = lib.name;
      if (seen.has(nameKey)) continue;
      seen.add(nameKey);

      // Main artifact
      if (lib.downloads?.artifact) {
        const libPath = getLibraryPath(lib.downloads.artifact.path);
        if (fileExists(libPath)) {
          paths.push(libPath);
        }
      } else if (lib.name) {
        // Convert maven name to path
        const parts = lib.name.split(':');
        if (parts.length >= 3) {
          const [group, artifact, version] = parts;
          const relPath = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
          const libPath = getLibraryPath(relPath);
          if (fileExists(libPath)) {
            paths.push(libPath);
          }
        }
      }

      // Native library
      const nativeClassifier = getNativeClassifier(lib);
      if (nativeClassifier && lib.downloads?.classifiers?.[nativeClassifier]) {
        const nativePath = getLibraryPath(lib.downloads.classifiers[nativeClassifier].path);
        if (fileExists(nativePath)) {
          paths.push(nativePath);
        }
      }
    }
  }

  return paths;
}

export async function buildLaunchCommand(opts: LaunchOptions): Promise<string[]> {
  const chain = await resolveVersionChain(opts.versionId);
  const rootDetail = chain[0];

  // Find Java
  let javaPath: string;
  if (opts.instanceConfig.customJavaPath) {
    javaPath = opts.instanceConfig.customJavaPath;
  } else if (opts.instanceConfig.autoJava) {
    const javaVersion = rootDetail.javaVersion?.majorVersion || 17;
    const javaInstall = await findBestJava(javaVersion);
    javaPath = javaInstall?.path || 'java';
  } else {
    javaPath = 'java';
  }

  // Build JVM arguments
  const jvmArgs: string[] = [];

  // Memory settings — auto RAM allocation if enabled
  let maxMemory = opts.instanceConfig.jvmMaxMemory || 2048;
  let minMemory = opts.instanceConfig.jvmMinMemory || 512;

  if (opts.autoRamAllocation) {
    const totalMemMB = Math.floor(os.totalmem() / (1024 * 1024));
    const reservedMB = Math.max(4096, Math.floor(totalMemMB * 0.25));
    const availableMB = totalMemMB - reservedMB;
    const runningCount = processManager.getRunningCount();
    const instancesRunning = runningCount + 1; // including this one
    maxMemory = Math.max(1024, Math.floor(availableMB / instancesRunning));
    minMemory = Math.max(256, Math.floor(maxMemory * 0.25));
  }

  jvmArgs.push(`-Xmx${maxMemory}m`);
  jvmArgs.push(`-Xms${minMemory}m`);

  // Collect JVM arguments from version details
  const allJvmArgs: string[] = [];
  for (const detail of chain) {
    if (detail.arguments?.jvm) {
      allJvmArgs.push(...getArguments(detail.arguments.jvm));
    } else if (!detail.arguments?.jvm && detail.minecraftArguments) {
      // Pre-1.13 uses different format
      allJvmArgs.push('-cp', '${classpath}');
    }
  }

  // Build classpath
  const libraryPaths = await getLibraryPaths(chain);
  const versionJarPath = getVersionJarPath(chain[0].id);

  // Check if jar exists for the root version or needs to use inherited jar
  let mainJar = versionJarPath;
  if (!fileExists(mainJar) && chain.length > 1) {
    mainJar = getVersionJarPath(chain[chain.length - 1].id);
  }

  const classpath = [...libraryPaths];
  if (fileExists(mainJar)) {
    classpath.push(mainJar);
  }

  const classpathStr = classpath.join(path.delimiter);

  // Replace variables in JVM args
  const resolvedJvmArgs = allJvmArgs.map(arg =>
    arg.replace(/\$\{classpath\}/g, classpathStr)
      .replace(/\$\{natives_directory\}/g, path.join(getVersionDir(opts.versionId), 'natives'))
      .replace(/\$\{launcher_name\}/g, 'terminal-craft-launcher')
      .replace(/\$\{launcher_version\}/g, '0.1')
  );

  jvmArgs.push(...resolvedJvmArgs);

  // Custom JVM args from instance config
  if (opts.instanceConfig.customJvmArgs) {
    jvmArgs.push(...opts.instanceConfig.customJvmArgs);
  }

  // Build game arguments
  const gameArgs: string[] = [];

  for (const detail of chain) {
    if (detail.arguments?.game) {
      gameArgs.push(...getArguments(detail.arguments.game));
    } else if (detail.minecraftArguments) {
      gameArgs.push(...detail.minecraftArguments.split(' '));
    }
  }

  // Resolve variables in game args
  const resolvedGameArgs = gameArgs.map(arg =>
    arg.replace(/\$\{auth_player_name\}/g, opts.account.username)
      .replace(/\$\{version_name\}/g, opts.versionId)
      .replace(/\$\{game_directory\}/g, opts.gameDir)
      .replace(/\$\{assets_root\}/g, PATHS.assets)
      .replace(/\$\{assets_index_name\}/g, chain[0].assetIndex?.id || chain[0].assets || '')
      .replace(/\$\{auth_uuid\}/g, opts.account.uuid)
      .replace(/\$\{auth_access_token\}/g, opts.account.accessToken || '0')
      .replace(/\$\{user_type\}/g, opts.account.type === 'microsoft' ? 'msa' : opts.account.type === 'yggdrasil' ? 'legacy' : 'legacy')
      .replace(/\$\{version_type\}/g, chain[0].type || 'release')
      .replace(/\$\{resolution_width\}/g, String(opts.instanceConfig.width || 854))
      .replace(/\$\{resolution_height\}/g, String(opts.instanceConfig.height || 480))
      .replace(/\$\{clientid\}/g, '')
      .replace(/\$\{auth_xuid\}/g, '')
      .replace(/\$\{quickPlayPath\}/g, '')
      .replace(/\$\{quickPlaySingleplayer\}/g, '')
      .replace(/\$\{quickPlayMultiplayer\}/g, '')
      .replace(/\$\{quickPlayRealms\}/g, '')
  );

  // Filter out --demo flag and empty-value arguments (e.g. --quickPlayPath "")
  const filteredGameArgs: string[] = [];
  for (let i = 0; i < resolvedGameArgs.length; i++) {
    const arg = resolvedGameArgs[i];
    if (arg === '--demo') { continue; }
    // If this is a --key and the next arg is empty, skip both
    if (arg.startsWith('--') && i + 1 < resolvedGameArgs.length && resolvedGameArgs[i + 1] === '') {
      i++; // skip the empty value too
      continue;
    }
    filteredGameArgs.push(arg);
  }

  // Build full command
  const mainClass = chain[0].mainClass;
  const command = [
    javaPath,
    ...jvmArgs,
    mainClass,
    ...filteredGameArgs,
  ];

  return command;
}

export async function launchGame(opts: LaunchOptions): Promise<{
  child: import('child_process').ChildProcess;
  command: string[];
}> {
  const command = await buildLaunchCommand(opts);
  const gameDir = opts.gameDir;
  const usedJavaPath = command[0];

  const child = require('child_process').spawn(command[0], command.slice(1), {
    cwd: gameDir,
    env: {
      ...process.env,
      JAVA_HOME: usedJavaPath ? usedJavaPath.replace(/\/bin\/java$/, '') : undefined,
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Set process priority
  if (opts.processPriority && child.pid) {
    try {
      const priorityMap: Record<string, number> = {
        high: os.constants.priority.PRIORITY_HIGH,
        medium: os.constants.priority.PRIORITY_NORMAL,
        low: os.constants.priority.PRIORITY_LOW,
      };
      const priority = priorityMap[opts.processPriority];
      if (priority !== undefined) {
        os.setPriority(child.pid, priority);
      }
    } catch { /* ignore — may need elevated privileges */ }
  }

  // Bring game window to foreground after a short delay
  if (child.pid) {
    setTimeout(() => {
      try {
        const platform = os.platform();
        if (platform === 'darwin') {
          require('child_process').exec(
            `osascript -e 'tell application "System Events" to set frontmost of every process whose unix id is ${child.pid} to true'`,
            (err: any) => { /* ignore */ }
          );
        } else if (platform === 'linux') {
          require('child_process').exec(
            `xdotool search --pid ${child.pid} windowactivate 2>/dev/null`,
            (err: any) => { /* ignore */ }
          );
        }
        // Windows: the game window usually comes to front automatically
      } catch { /* ignore */ }
    }, 3000);
  }

  child.unref();

  // Register with process manager
  if (child.pid) {
    processManager.register(
      child.pid,
      opts.instanceId || '',
      opts.instanceName || '',
      opts.versionId,
      opts.accountId || '',
      child
    );

    child.on('exit', () => {
      processManager.unregister(child.pid!);
    });
  }

  return { child, command };
}
