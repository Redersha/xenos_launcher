export type ModLoaderType = 'fabric' | 'forge' | 'neoforge' | 'quilt';

export interface ModLoaderVersion {
  type: ModLoaderType;
  version: string;
  gameVersion: string;
  stable: boolean;
}

export interface ModLoaderInfo {
  type: ModLoaderType;
  version: string;
}

export const MOD_LOADER_LABELS: Record<ModLoaderType, string> = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
};
