import * as fs from 'fs';
import { PATHS, readFileSafe } from './paths.js';
import { AuthAccount } from '../types/auth.js';
import { GameInstance, InstanceConfig } from '../types/instance.js';
import { JdkDistribution } from '../types/java.js';

export interface AppConfig {
  defaultInstanceId?: string;
  defaultAccountId?: string;
  jvmMaxMemory: number;
  jvmMinMemory: number;
  preferredJdkDistribution: JdkDistribution;
  autoDownloadJdk: boolean;
  checkUpdatesOnStart: boolean;
  language: string;
  customYggdrasilServers: { name: string; url: string; registerUrl?: string }[];
  processPriority: 'high' | 'medium' | 'low';
  autoRamAllocation: boolean;
  lastPlayedInstanceId?: string;
  lastPlayedAccountId?: string;
}

const DEFAULT_CONFIG: AppConfig = {
  jvmMaxMemory: 2048,
  jvmMinMemory: 512,
  preferredJdkDistribution: 'azul',
  autoDownloadJdk: true,
  checkUpdatesOnStart: true,
  language: 'zh-CN',
  customYggdrasilServers: [],
  processPriority: 'medium',
  autoRamAllocation: false,
};

function loadJson<T>(filePath: string, defaultVal: T): T {
  const content = readFileSafe(filePath);
  if (!content) return defaultVal;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(defaultVal)) {
      return Array.isArray(parsed) ? parsed as T : defaultVal;
    }
    if (typeof defaultVal === 'object' && defaultVal !== null) {
      return { ...defaultVal, ...parsed };
    }
    return parsed;
  } catch {
    return defaultVal;
  }
}

function saveJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function loadConfig(): AppConfig {
  return loadJson<AppConfig>(PATHS.configFile, DEFAULT_CONFIG);
}

export function saveConfig(config: AppConfig): void {
  saveJson(PATHS.configFile, config);
}

export function loadAccounts(): AuthAccount[] {
  return loadJson<AuthAccount[]>(PATHS.accountsFile, []);
}

export function saveAccounts(accounts: AuthAccount[]): void {
  saveJson(PATHS.accountsFile, accounts);
}

export function loadInstances(): GameInstance[] {
  return loadJson<GameInstance[]>(PATHS.instancesFile, []);
}

export function saveInstances(instances: GameInstance[]): void {
  saveJson(PATHS.instancesFile, instances);
}

export function loadInstanceConfig(instanceId: string): InstanceConfig {
  const configPath = `${PATHS.instances}/${instanceId}/config.json`;
  const defaultConfig: InstanceConfig = {
    instanceId,
    autoJava: true,
    jvmMaxMemory: loadConfig().jvmMaxMemory,
    jvmMinMemory: loadConfig().jvmMinMemory,
  };
  return loadJson<InstanceConfig>(configPath, defaultConfig);
}

export function saveInstanceConfig(config: InstanceConfig): void {
  const dir = `${PATHS.instances}/${config.instanceId}`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  saveJson(`${dir}/config.json`, config);
}
