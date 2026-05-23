import { ModLoaderInfo } from './modloader.js';

export interface GameInstance {
  id: string;
  name: string;
  versionId: string;
  gameDir: string;
  modLoader?: ModLoaderInfo;
  loaderVersion?: string; // 具体的模组加载器版本
  javaPath?: string;
  jvmArgs?: string[];
  gameArgs?: string[];
  resolution?: { width: number; height: number };
  createdAt: number;
  lastPlayed?: number;
  icon?: string;
  notes?: string;
}

export interface InstanceConfig {
  instanceId: string;
  autoJava: boolean;
  customJavaPath?: string;
  jvmMaxMemory?: number;
  jvmMinMemory?: number;
  fullscreen?: boolean;
  width?: number;
  height?: number;
  customJvmArgs?: string[];
}
