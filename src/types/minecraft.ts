// Minecraft version types
export interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: VersionEntry[];
}

export interface VersionEntry {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  time: string;
  releaseTime: string;
  sha1?: string;
  complianceLevel?: number;
}

export interface VersionDetail {
  id: string;
  type: string;
  time: string;
  releaseTime: string;
  mainClass: string;
  minecraftArguments?: string; // pre 1.13
  arguments?: {
    game: ArgumentEntry[];
    jvm: ArgumentEntry[];
  };
  libraries: Library[];
  assetIndex: AssetIndex;
  assets: string;
  downloads: VersionDownloads;
  javaVersion?: JavaVersionRequirement;
  inheritsFrom?: string;
  jar?: string;
}

export type ArgumentEntry = string | {
  value: string | string[];
  rules?: Rule[];
};

export interface Rule {
  action: 'allow' | 'disallow';
  os?: OsRule;
  features?: Record<string, boolean>;
}

export interface OsRule {
  name?: string;
  arch?: string;
  version?: string;
}

export interface JavaVersionRequirement {
  component: string;
  majorVersion: number;
}

export interface Library {
  name: string;
  downloads?: {
    artifact?: LibraryDownload;
    classifiers?: Record<string, LibraryDownload>;
  };
  rules?: Rule[];
  natives?: Record<string, string>;
  extract?: { exclude?: string[] };
}

export interface LibraryDownload {
  path: string;
  sha1: string;
  size: number;
  url: string;
}

export interface AssetIndex {
  id: string;
  sha1: string;
  size: number;
  totalSize: number;
  url: string;
}

export interface VersionDownloads {
  client?: DownloadEntry;
  client_mappings?: DownloadEntry;
  server?: DownloadEntry;
}

export interface DownloadEntry {
  sha1: string;
  size: number;
  url: string;
}
