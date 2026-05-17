export interface GameInstance {
  id: string;
  name: string;
  versionId: string;
  gameDir: string;
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
