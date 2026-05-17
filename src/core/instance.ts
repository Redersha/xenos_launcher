import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { GameInstance, InstanceConfig } from '../types/instance.js';
import { getInstanceDir, PATHS } from '../store/paths.js';
import { loadInstances, saveInstances, loadInstanceConfig, saveInstanceConfig } from '../store/config.js';

export function createInstance(opts: {
  name: string;
  versionId: string;
  javaPath?: string;
  jvmArgs?: string[];
  resolution?: { width: number; height: number };
}): GameInstance {
  const id = `instance_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const gameDir = getInstanceDir(id);

  // Ensure instance directory exists
  if (!fs.existsSync(gameDir)) {
    fs.mkdirSync(gameDir, { recursive: true });
  }

  const instance: GameInstance = {
    id,
    name: opts.name,
    versionId: opts.versionId,
    gameDir,
    javaPath: opts.javaPath,
    jvmArgs: opts.jvmArgs,
    resolution: opts.resolution,
    createdAt: Date.now(),
  };

  const instances = loadInstances();
  instances.push(instance);
  saveInstances(instances);

  // Create default config
  const config: InstanceConfig = {
    instanceId: id,
    autoJava: !opts.javaPath,
    customJavaPath: opts.javaPath,
    jvmMaxMemory: 2048,
    jvmMinMemory: 512,
  };
  saveInstanceConfig(config);

  return instance;
}

export function deleteInstance(instanceId: string): boolean {
  const instances = loadInstances();
  const idx = instances.findIndex(i => i.id === instanceId);
  if (idx === -1) return false;

  instances.splice(idx, 1);
  saveInstances(instances);

  // Optionally remove instance directory
  const dir = getInstanceDir(instanceId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return true;
}

export function updateInstance(instanceId: string, updates: Partial<GameInstance>): GameInstance | null {
  const instances = loadInstances();
  const idx = instances.findIndex(i => i.id === instanceId);
  if (idx === -1) return null;

  instances[idx] = { ...instances[idx], ...updates };
  saveInstances(instances);
  return instances[idx];
}

export function getInstance(instanceId: string): GameInstance | undefined {
  return loadInstances().find(i => i.id === instanceId);
}

export function listInstances(): GameInstance[] {
  return loadInstances();
}

export function getInstanceConfig(instanceId: string): InstanceConfig {
  return loadInstanceConfig(instanceId);
}

export function updateInstanceConfig(config: InstanceConfig): void {
  saveInstanceConfig(config);
}

export function importInstance(opts: {
  name: string;
  versionId: string;
  gameDir: string;
}): GameInstance | null {
  // Verify the game directory exists
  if (!fs.existsSync(opts.gameDir)) {
    return null;
  }

  const id = `instance_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const instanceDir = getInstanceDir(id);

  // Ensure instance directory exists
  if (!fs.existsSync(instanceDir)) {
    fs.mkdirSync(instanceDir, { recursive: true });
  }

  const instance: GameInstance = {
    id,
    name: opts.name,
    versionId: opts.versionId,
    gameDir: opts.gameDir,
    createdAt: Date.now(),
  };

  const instances = loadInstances();
  instances.push(instance);
  saveInstances(instances);

  // Create default config
  const config: InstanceConfig = {
    instanceId: id,
    autoJava: true,
    jvmMaxMemory: 2048,
    jvmMinMemory: 512,
  };
  saveInstanceConfig(config);

  return instance;
}

export function detectVersionsInDir(dir: string): string[] {
  const versions: string[] = [];
  const versionsDir = path.join(dir, 'versions');

  if (!fs.existsSync(versionsDir)) return versions;

  try {
    const entries = fs.readdirSync(versionsDir);
    for (const entry of entries) {
      const versionJsonPath = path.join(versionsDir, entry, `${entry}.json`);
      if (fs.existsSync(versionJsonPath)) {
        versions.push(entry);
      }
    }
  } catch { /* ignore permission errors */ }

  return versions;
}
